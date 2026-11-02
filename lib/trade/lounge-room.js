/** Shared GVEGAS trade lounge — one room for all bots and spectators. */

export const DEFAULT_LOUNGE_NAME = 'Trade talks';

/**
 * Canonical lounge room id: TRADE_LOUNGE_ROOM_ID, else a room named DEFAULT_LOUNGE_NAME,
 * else the oldest room, else create DEFAULT_LOUNGE_NAME.
 */
export async function resolveLoungeRoomId(trade, env = process.env) {
  const fixed = typeof env.TRADE_LOUNGE_ROOM_ID === 'string' ? env.TRADE_LOUNGE_ROOM_ID.trim() : '';
  if (fixed) {
    const room = await trade.getRoomById(fixed);
    if (!room) throw new Error(`TRADE_LOUNGE_ROOM_ID not found: ${fixed}`);
    return fixed;
  }
  const rooms = await trade.listRooms();
  const named = rooms.find((r) => r.name === DEFAULT_LOUNGE_NAME);
  if (named) return named.id;
  if (rooms.length) return rooms[rooms.length - 1].id;
  const created = await trade.createRoom(DEFAULT_LOUNGE_NAME);
  return created.id;
}

/** Legacy room ids and API paths map to the single lounge. */
export async function mapToLoungeRoomId(trade, _roomId, env = process.env) {
  return resolveLoungeRoomId(trade, env);
}

export async function loungePublicMeta(trade, env = process.env) {
  const id = await resolveLoungeRoomId(trade, env);
  const room = await trade.getRoomById(id);
  return {
    id,
    name: room?.name ?? DEFAULT_LOUNGE_NAME,
    path: '/trade',
  };
}
