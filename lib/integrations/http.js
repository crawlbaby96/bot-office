// Server-side HTTP helper for the provider fetchers. Error messages are short and generic: they never include the
// API key, request headers, or response bodies, because they are stored and shown in the office.

export class ProviderError extends Error {
  /** kind: 'refused' (the API rejected the key or the plan) or 'error' (network, rate limit, 5xx, bad shape). */
  constructor(kind, message, status = null) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

const REFUSED = new Set([401, 402, 403, 404]);
export const REQUEST_TIMEOUT_MS = 10000;

export async function requestJson(fetchImpl, url, { method = 'GET', headers = {}, body, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const host = new URL(url).host;
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      headers: { accept: 'application/json', 'user-agent': 'bot-office/1.0', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ProviderError('error', `could not reach ${host}`);
  }
  if (REFUSED.has(res.status)) throw new ProviderError('refused', `API refused the key (${res.status})`, res.status);
  if (res.status === 429) throw new ProviderError('error', 'rate limited by the API (429)', 429);
  if (!res.ok) throw new ProviderError('error', `API error (${res.status})`, res.status);
  try {
    return await res.json();
  } catch {
    throw new ProviderError('error', 'API response was not JSON');
  }
}

/** Follows `has_more` / `next_page` (the OpenAI and Anthropic usage APIs share this shape) and returns all buckets. */
export async function pagedBuckets(fetchImpl, url, headers, maxPages = 10) {
  const out = [];
  let page = null;
  for (let i = 0; i < maxPages; i++) {
    const res = await requestJson(fetchImpl, page ? `${url}&page=${encodeURIComponent(page)}` : url, { headers });
    if (!res || !Array.isArray(res.data)) throw badShape('buckets');
    out.push(...res.data);
    page = res.has_more && typeof res.next_page === 'string' ? res.next_page : null;
    if (!page) break;
  }
  return out;
}

export function badShape(what) {
  return new ProviderError('error', `unexpected API response (${what})`);
}

export function toProviderError(err) {
  if (err instanceof ProviderError) return err;
  console.error('[office] provider fetch failed', err);
  return new ProviderError('error', 'fetch failed');
}

export const basicAuth = (key) => `Basic ${btoa(`${key}:`)}`;

export const trimBase = (url, fallback) => String(url || fallback).replace(/\/+$/, '');

export const round2 = (n) => Math.round(n * 100) / 100;
export const centsToUsd = (cents) => Math.round(cents) / 100;

/** UTC calendar-month start and the start of the 7-day window (today plus the previous 6 UTC days), in ms. */
export function windows(nowMs) {
  const d = new Date(nowMs);
  const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const todayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const weekStart = todayStart - 6 * 86400000;
  return { monthStart, weekStart, start: Math.min(monthStart, weekStart) };
}

export const isoSeconds = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
