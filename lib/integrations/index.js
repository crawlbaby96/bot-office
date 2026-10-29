import { fetchAnthropicUsage } from './anthropic.js';
import { fetchCloudAgents, MAX_CONTRACTORS } from './cursor-agents.js';
import { fetchCursorSpend } from './cursor-admin.js';
import { toProviderError } from './http.js';
import { fetchOpenAIUsage } from './openai.js';

export { MAX_CONTRACTORS };

// Contractors come from the 5-minute heartbeat cron; a snapshot older than this is shown as stale (no contractors).
export const CONTRACTORS_FRESH_MS = 15 * 60 * 1000;
// Usage comes from the hourly cron; a reading older than this is shown as stale.
export const PROVIDER_FRESH_MS = 3 * 60 * 60 * 1000;

// `*_API_BASE` overrides exist for the e2e mock server only; production uses the official hosts.
export const PROVIDERS = [
  { id: 'cursor', label: 'Cursor', sub: 'Team spend, current billing cycle', keyEnv: 'CURSOR_ADMIN_API_KEY', baseEnv: 'CURSOR_API_BASE', fetch: fetchCursorSpend },
  { id: 'openai', label: 'OpenAI API', sub: 'Organization costs', keyEnv: 'OPENAI_ADMIN_KEY', baseEnv: 'OPENAI_API_BASE', fetch: fetchOpenAIUsage },
  { id: 'anthropic', label: 'Anthropic API', sub: 'Organization costs', keyEnv: 'ANTHROPIC_ADMIN_KEY', baseEnv: 'ANTHROPIC_API_BASE', fetch: fetchAnthropicUsage },
];

const clip = (s) => String(s ?? '').slice(0, 200);

/** Heartbeat step: fetch running cloud agents and store one snapshot. Skipped (nothing stored) without CURSOR_API_KEY. */
export async function refreshCloudAgents(store, env = process.env, { fetch: fetchImpl = fetch, now = new Date() } = {}) {
  if (!env.CURSOR_API_KEY) return { outcome: 'not_configured' };
  const { lastOk } = await store.cloudAgentSnapshots();
  const known = new Map((lastOk?.agents ?? []).map((a) => [a.id, a]));
  try {
    const r = await fetchCloudAgents({ apiKey: env.CURSOR_API_KEY, baseUrl: env.CURSOR_API_BASE, fetch: fetchImpl, known });
    await store.putCloudAgentSnapshot({ outcome: 'ok', detail: '', ...r }, now);
    return { outcome: 'ok', running: r.running };
  } catch (err) {
    const e = toProviderError(err);
    await store.putCloudAgentSnapshot({ outcome: e.kind, detail: clip(e.message), running: null, runningAtLeast: false, agents: [] }, now);
    return { outcome: e.kind, detail: e.message };
  }
}

/** Hourly usage cron: one reading per configured provider. Providers without a key are skipped (nothing stored). */
export async function refreshProviderUsage(store, env = process.env, { fetch: fetchImpl = fetch, now = new Date() } = {}) {
  return Promise.all(PROVIDERS.map(async (p) => {
    const apiKey = env[p.keyEnv];
    if (!apiKey) return { provider: p.id, outcome: 'not_configured' };
    const readAt = now.toISOString();
    try {
      const metrics = await p.fetch({ apiKey, baseUrl: env[p.baseEnv], fetch: fetchImpl, nowMs: now.getTime() });
      await store.putProviderReading({ provider: p.id, outcome: 'ok', detail: '', metrics, readAt });
      return { provider: p.id, outcome: 'ok' };
    } catch (err) {
      const e = toProviderError(err);
      await store.putProviderReading({ provider: p.id, outcome: e.kind, detail: clip(e.message), metrics: null, readAt });
      return { provider: p.id, outcome: e.kind, detail: e.message };
    }
  }));
}

/**
 * What the office shows for cloud agents. Contractors are only shown from a fresh, successful snapshot.
 * status: 'ok' | 'pending' (key set, no fetch yet) | 'stale' | 'not_connected'.
 */
export function contractorsView({ configured, lastAttempt, lastOk, nowMs = Date.now() }) {
  const empty = { running: 0, runningAtLeast: false, agents: [], asOf: null, staleSince: null, lastFetchFailed: null };
  if (!configured) return { ...empty, status: 'not_connected', detail: 'CURSOR_API_KEY is not set' };
  if (lastAttempt?.outcome === 'refused') {
    return { ...empty, status: 'not_connected', detail: lastAttempt.detail, lastAttemptAt: lastAttempt.checkedAt };
  }
  if (!lastOk) {
    if (!lastAttempt) return { ...empty, status: 'pending', detail: 'Waiting for the first fetch' };
    return { ...empty, status: 'not_connected', detail: `Last fetch failed: ${lastAttempt.detail}`, lastAttemptAt: lastAttempt.checkedAt };
  }
  const failed = lastAttempt && lastAttempt.outcome !== 'ok' ? lastAttempt.detail : null;
  if (nowMs - Date.parse(lastOk.checkedAt) > CONTRACTORS_FRESH_MS) {
    return { ...empty, status: 'stale', staleSince: lastOk.checkedAt, detail: failed ? `Last fetch failed: ${failed}` : 'No recent fetch', lastFetchFailed: failed };
  }
  return {
    status: 'ok',
    detail: '',
    asOf: lastOk.checkedAt,
    staleSince: null,
    lastFetchFailed: failed,
    running: lastOk.running ?? lastOk.agents.length,
    runningAtLeast: !!lastOk.runningAtLeast,
    agents: lastOk.agents.slice(0, MAX_CONTRACTORS),
  };
}

/** What the usage board shows for one provider. status: 'ok' | 'pending' | 'stale' | 'not_connected'. */
export function providerView({ provider, configured, lastAttempt, lastOk, nowMs = Date.now() }) {
  const base = { id: provider.id, label: provider.label, sub: provider.sub, readAt: null, staleSince: null, metrics: null };
  if (!configured) return { ...base, status: 'not_connected', detail: `${provider.keyEnv} is not set` };
  if (lastAttempt?.outcome === 'refused') return { ...base, status: 'not_connected', detail: lastAttempt.detail };
  if (!lastOk) {
    if (!lastAttempt) return { ...base, status: 'pending', detail: 'Waiting for the first reading' };
    return { ...base, status: 'not_connected', detail: `Last fetch failed: ${lastAttempt.detail}` };
  }
  const failed = lastAttempt && lastAttempt.outcome !== 'ok' ? lastAttempt.detail : null;
  const old = nowMs - Date.parse(lastOk.readAt) > PROVIDER_FRESH_MS;
  if (failed || old) {
    return { ...base, status: 'stale', detail: failed ? `Last fetch failed: ${failed}` : 'No recent reading', readAt: lastOk.readAt, staleSince: lastOk.readAt, metrics: lastOk.metrics };
  }
  return { ...base, status: 'ok', detail: '', readAt: lastOk.readAt, metrics: lastOk.metrics };
}

export async function integrationsSnapshot(store, env = process.env, nowMs = Date.now()) {
  const [agents, readings] = await Promise.all([store.cloudAgentSnapshots(), store.providerReadings()]);
  return {
    contractors: contractorsView({ configured: !!env.CURSOR_API_KEY, ...agents, nowMs }),
    providers: PROVIDERS.map((p) => providerView({ provider: p, configured: !!env[p.keyEnv], ...(readings[p.id] ?? {}), nowMs })),
  };
}

/** Shown when the store itself can't be read: every row says so instead of showing numbers. */
export function unavailableIntegrations(env = process.env) {
  const detail = 'Status store could not be read';
  return {
    contractors: { ...contractorsView({ configured: false }), detail },
    providers: PROVIDERS.map((p) => ({ ...providerView({ provider: p, configured: false }), detail: env[p.keyEnv] ? detail : `${p.keyEnv} is not set` })),
  };
}
