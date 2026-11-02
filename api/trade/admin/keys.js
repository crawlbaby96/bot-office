import { json, readJson, requireSession } from '../../../lib/http.js';
import { getTradeStore } from '../../../lib/trade/index.js';
import { resolveLoungeRoomId } from '../../../lib/trade/lounge-room.js';

export async function POST(request) {
  const denied = await requireSession(request);
  if (denied) return denied;
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return json({ error: e.message }, e.status || 400);
  }
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label || label.length > 80) return json({ error: 'label is required (max 80 chars)' }, 400);
  const trade = await getTradeStore();
  const roomId = await resolveLoungeRoomId(trade);
  const { key, plaintext } = await trade.createKey(roomId, label);
  return json(
    {
      key: { id: key.id, label: key.label, roomId: key.roomId, createdAt: key.createdAt },
      guestKey: plaintext,
      lounge: { id: roomId, path: '/trade' },
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
  const keyId = typeof body.keyId === 'string' ? body.keyId.trim() : '';
  if (!keyId) return json({ error: 'keyId is required' }, 400);
  const trade = await getTradeStore();
  const row = await trade.getKeyRow(keyId);
  if (!row) return json({ error: 'Key not found or already revoked' }, 404);
  const revoked = await trade.revokeKey(row.roomId, keyId);
  if (!revoked) return json({ error: 'Key not found or already revoked' }, 404);
  return json({ ok: true, key: { id: revoked.id, revokedAt: revoked.revokedAt } });
}
