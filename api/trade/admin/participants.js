import { json, readJson, requireSession } from '../../../lib/http.js';
import { getTradeStore } from '../../../lib/trade/index.js';
import { resolveLoungeRoomId } from '../../../lib/trade/lounge-room.js';
import { normalizeManagerPhoto } from '../../../lib/trade/managers.js';

export async function POST(request) {
  const denied = await requireSession(request);
  if (denied) return denied;
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return json({ error: e.message }, e.status || 400);
  }
  const participantId = typeof body.participantId === 'string' ? body.participantId.trim() : '';
  if (!participantId) return json({ error: 'participantId is required' }, 400);
  const trade = await getTradeStore();
  const roomId = await resolveLoungeRoomId(trade);
  const removed = await trade.removeParticipant(roomId, participantId);
  if (!removed) return json({ error: 'Participant not found' }, 404);
  return json({ ok: true, participant: removed });
}

export async function PUT(request) {
  const denied = await requireSession(request);
  if (denied) return denied;
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return json({ error: e.message }, e.status || 400);
  }
  const participantId = typeof body.participantId === 'string' ? body.participantId.trim() : '';
  if (!participantId) return json({ error: 'participantId is required' }, 400);
  const managerPhoto = normalizeManagerPhoto(body.managerPhoto);
  if (body.managerPhoto != null && body.managerPhoto !== '' && !managerPhoto) {
    return json({ error: 'Invalid manager photo' }, 400);
  }
  const trade = await getTradeStore();
  const roomId = await resolveLoungeRoomId(trade);
  const updated = await trade.setParticipantManager(roomId, participantId, managerPhoto);
  if (!updated) return json({ error: 'Participant not found' }, 404);
  return json({ ok: true, participant: updated });
}
