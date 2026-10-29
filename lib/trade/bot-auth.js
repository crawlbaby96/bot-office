import { bearerToken } from '../auth.js';
import { clientIp, error, readJson } from '../http.js';
import { matchGuestKey } from './keys.js';
import { LIMITS, takeRate } from './limits.js';
import { getTradeStore } from './index.js';

export async function resolveGuestAuth(request) {
  const token = bearerToken(request);
  if (!token) return { err: error(401, 'Missing bearer guest key') };
  const trade = await getTradeStore();
  const rows = await trade.listActiveKeyRows();
  const row = await matchGuestKey(rows, token);
  if (!row) return { err: error(401, 'Invalid or revoked guest key') };
  const ip = clientIp(request);
  if (!takeRate(`trade:bot:${row.id}:${ip}`, { limit: LIMITS.botRequestsPerMinute })) {
    return { err: error(429, 'Rate limit exceeded') };
  }
  return { trade, roomId: row.roomId, keyId: row.id, keyLabel: row.label };
}

export async function readBotJson(request) {
  try {
    return { body: await readJson(request, 16384) };
  } catch (e) {
    return { err: error(e.status || 400, e.message) };
  }
}

export function participantHeader(request) {
  return request.headers.get('x-trade-participant')?.trim() || null;
}
