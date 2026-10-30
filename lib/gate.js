import { hasValidSession } from './auth.js';

// Write endpoints authenticate with OFFICE_PUSH_TOKEN inside the handler; the cron routes with CRON_SECRET.
function isMachineRoute(method, path) {
  if (method === 'POST' && (path === '/api/status' || path === '/api/usage')) return true;
  if (path === '/api/cron/heartbeat' || path === '/api/cron/usage') return true;
  return false;
}

function isTradeAdminPath(path) {
  return path === '/trade/admin' || path.startsWith('/trade/admin/') || path.startsWith('/api/trade/admin/');
}

/** GVEGAS trade lounge: public pages and read APIs; admin is gated separately. */
function isTradePublicPath(path) {
  if (isTradeAdminPath(path)) return false;
  if (path === '/trade' || path.startsWith('/trade/')) return true;
  if (path.startsWith('/api/trade/bot/')) return true;
  if (path === '/api/trade/rooms' || path.startsWith('/api/trade/rooms/')) return true;
  if (path.startsWith('/src/trade/')) return true;
  if (path === '/src/scene/bot.js' || path === '/src/scene/materials.js') return true;
  if (path === '/trade/badge.png' || path.startsWith('/trade/badge.')) return true;
  if (/^\/assets\/trade(Admin|Room|Docs)?-/.test(path)) return true;
  if (/^\/assets\/(trade|tradeRoom|tradeAdmin|style-|modulepreload-polyfill|OrbitControls)/.test(path)) return true;
  return false;
}

/** Vite dev bundles for public trade pages without an office session. */
function isTradeViteHelper(path) {
  if (path.startsWith('/@vite/') || path.startsWith('/@fs/') || path.startsWith('/@id/')) return true;
  if (path.startsWith('/node_modules/.vite/deps/')) return true;
  if (path.startsWith('/node_modules/vite/')) return true;
  return false;
}

const PUBLIC_PATHS = new Set(['/login', '/login.html', '/api/login', '/favicon.svg']);

/**
 * Decide what to do with a request before it reaches pages, assets or read APIs.
 * Returns { action: 'next' } | { action: 'redirect', location } | { action: 'deny', status, body }.
 */
export async function gate(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (PUBLIC_PATHS.has(path)) return { action: 'next' };
  if (isTradePublicPath(path)) return { action: 'next' };
  if (isTradeViteHelper(path)) return { action: 'next' };
  if (isMachineRoute(request.method, path)) return { action: 'next' };
  if (!env.OFFICE_PASSWORD) {
    return { action: 'deny', status: 503, body: 'OFFICE_PASSWORD is not configured' };
  }
  if (await hasValidSession(request, env)) return { action: 'next' };
  if (path.startsWith('/api/')) return { action: 'deny', status: 401, body: 'Unauthorized' };
  const next = path === '/' ? '' : `?next=${encodeURIComponent(path + url.search)}`;
  return { action: 'redirect', location: `/login${next}` };
}
