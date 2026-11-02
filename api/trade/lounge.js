import { json } from '../../lib/http.js';
import { getTradeStore } from '../../lib/trade/index.js';
import { loungePublicMeta, resolveLoungeRoomId } from '../../lib/trade/lounge-room.js';

export async function GET() {
  const trade = await getTradeStore();
  const roomId = await resolveLoungeRoomId(trade);
  const snap = await trade.roomSnapshot(roomId);
  if (!snap) return json({ error: 'Lounge not available' }, 503);
  const lounge = await loungePublicMeta(trade);
  return json({
    serverTime: new Date().toISOString(),
    lounge,
    room: snap.room,
    participants: snap.participants,
    messages: snap.messages,
    offers: snap.offers,
  });
}
