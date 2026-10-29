import { hasValidSession } from './auth.js';

const PUBLIC_PATHS = new Set(['/login', '/login.html', '/api/login', '/favicon.svg']);

// Write endpoints authenticate with OFFICE_PUSH_TOKEN inside the handler; the cron route with CRON_SECRET.
function isMachineRoute(method, path) {
  if (method === 'POST' && (path === '/api/status' || path === '/api/usage')) return true;
  if (path === '/api/cron/heartbeat') return true;
  return false;
}

/**
 * Decide what to do with a request before it reaches pages, assets or read APIs.
 * Returns { action: 'next' } | { action: 'redirect', location } | { action: 'deny', status, body }.
 */
export async function gate(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (PUBLIC_PATHS.has(path)) return { action: 'next' };
  if (isMachineRoute(request.method, path)) return { action: 'next' };
  if (!env.OFFICE_PASSWORD) {
    return { action: 'deny', status: 503, body: 'OFFICE_PASSWORD is not configured' };
  }
  if (await hasValidSession(request, env)) return { action: 'next' };
  if (path.startsWith('/api/')) return { action: 'deny', status: 401, body: 'Unauthorized' };
  const next = path === '/' ? '' : `?next=${encodeURIComponent(path + url.search)}`;
  return { action: 'redirect', location: `/login${next}` };
}
