import { json, readJson, requireSession } from '../../../lib/http.js';
import { getTradeStore } from '../../../lib/trade/index.js';

export async function POST(request) {
  const denied = await requireSession(request);
  if (denied) return denied;
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return json({ error: e.message }, e.status || 400);
  }
  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!roomId || !label || label.length > 80) return json({ error: 'roomId and label are required' }, 400);
  const trade = await getTradeStore();
  const room = await trade.getRoomById(roomId);
  if (!room) return json({ error: 'Room not found' }, 404);
  const { key, plaintext } = await trade.createKey(roomId, label);
  return json(
    {
      key: { id: key.id, label: key.label, roomId: key.roomId, createdAt: key.createdAt },
      guestKey: plaintext,
      note: 'Save the guestKey now; it is shown only once.',
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
  const keyId = typeof body.keyId === 'string' ? body.keyId.trim() : '';
  if (!roomId || !keyId) return json({ error: 'roomId and keyId are required' }, 400);
  const trade = await getTradeStore();
  const revoked = await trade.revokeKey(roomId, keyId);
  if (!revoked) return json({ error: 'Key not found or already revoked' }, 404);
  return json({ ok: true, key: { id: revoked.id, revokedAt: revoked.revokedAt } });
}
