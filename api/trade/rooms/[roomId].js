import { error, json } from '../../../lib/http.js';
import { getTradeStore } from '../../../lib/trade/index.js';
import { loungePublicMeta, mapToLoungeRoomId } from '../../../lib/trade/lounge-room.js';

export async function GET(request) {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/\/+$/, '').split('/');
  const requestedId = parts[parts.length - 1];
  if (!requestedId || requestedId === 'rooms') return error(404, 'Not found');
  const trade = await getTradeStore();
  const roomId = await mapToLoungeRoomId(trade, requestedId);
  const snap = await trade.roomSnapshot(roomId);
  if (!snap) return error(404, 'Room not found');
  const lounge = await loungePublicMeta(trade);
  return json({
    serverTime: new Date().toISOString(),
    lounge,
    room: snap.room,
    path: `/trade/r/${requestedId}`,
    watchPath: '/trade',
    participants: snap.participants,
    messages: snap.messages,
    offers: snap.offers,
  });
}
