import { json } from '../../lib/http.js';
import { getTradeStore } from '../../lib/trade/index.js';
import { loungePublicMeta } from '../../lib/trade/lounge-room.js';

/** Legacy list endpoint — returns the single shared lounge. */
export async function GET() {
  const trade = await getTradeStore();
  const lounge = await loungePublicMeta(trade);
  return json({
    lounge,
    rooms: [
      {
        id: lounge.id,
        name: lounge.name,
        path: lounge.path,
        createdAt: (await trade.getRoomById(lounge.id))?.createdAt ?? null,
      },
    ],
  });
}
