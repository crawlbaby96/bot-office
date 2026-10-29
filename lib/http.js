import { hasValidSession } from './auth.js';

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function error(status, message) {
  return json({ error: message }, status);
}

export async function readJson(request, maxBytes = 4096) {
  const text = await request.text();
  if (text.length > maxBytes) throw Object.assign(new Error('Request body too large'), { status: 413 });
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Body must be valid JSON'), { status: 400 });
  }
}

/** Read endpoints re-check the session even though the routing middleware already did. */
export async function requireSession(request) {
  if (!process.env.OFFICE_PASSWORD) return error(503, 'OFFICE_PASSWORD is not configured');
  if (!(await hasValidSession(request, process.env))) return error(401, 'Unauthorized');
  return null;
}

export function clientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
