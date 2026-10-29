import { error, json } from '../../../lib/http.js';
import { getTradeStore } from '../../../lib/trade/index.js';

export async function GET(request) {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/\/+$/, '').split('/');
  const roomId = parts[parts.length - 1];
  if (!roomId || roomId === 'rooms') return error(404, 'Not found');
  const trade = await getTradeStore();
  const snap = await trade.roomSnapshot(roomId);
  if (!snap) return error(404, 'Room not found');
  return json({
    serverTime: new Date().toISOString(),
    room: snap.room,
    path: `/trade/r/${roomId}`,
    participants: snap.participants,
    messages: snap.messages,
    offers: snap.offers,
  });
}
