import { json, readJson, requireSession } from '../../../lib/http.js';
import { getTradeStore } from '../../../lib/trade/index.js';

export async function GET(request) {
  const denied = await requireSession(request);
  if (denied) return denied;
  const trade = await getTradeStore();
  const rooms = await trade.listRooms();
  const withKeys = await Promise.all(
    rooms.map(async (room) => {
      const keys = (await trade.listKeys(room.id)).map(({ id, label, createdAt, revokedAt }) => ({
        id,
        label,
        createdAt,
        revoked: !!revokedAt,
      }));
      return {
        id: room.id,
        name: room.name,
        path: `/trade/r/${room.id}`,
        createdAt: room.createdAt,
        keys,
      };
    }),
  );
  return json({ rooms: withKeys });
}

export async function POST(request) {
  const denied = await requireSession(request);
  if (denied) return denied;
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return json({ error: e.message }, e.status || 400);
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 80) return json({ error: 'name is required (max 80 chars)' }, 400);
  const trade = await getTradeStore();
  const room = await trade.createRoom(name);
  return json(
    {
      room: {
        id: room.id,
        name: room.name,
        path: `/trade/r/${room.id}`,
        createdAt: room.createdAt,
      },
    },
    201,
  );
}

export async function DELETE(request) {
  const denied = await requireSession(request);
  if (denied) return denied;
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return json({ error: e.message }, e.status || 400);
  }
  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
  if (!roomId) return json({ error: 'roomId is required' }, 400);
  const trade = await getTradeStore();
  const deleted = await trade.deleteRoom(roomId);
  if (!deleted) return json({ error: 'Room not found' }, 404);
  return json({ ok: true, roomId: deleted });
}
