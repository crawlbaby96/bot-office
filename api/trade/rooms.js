import { json } from '../../../lib/http.js';
import { getTradeStore } from '../../../lib/trade/index.js';

export async function GET() {
  const trade = await getTradeStore();
  const rooms = await trade.listRooms();
  return json({
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      path: `/trade/r/${r.id}`,
      createdAt: r.createdAt,
    })),
  });
}
