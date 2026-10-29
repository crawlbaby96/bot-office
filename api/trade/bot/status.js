import { error, json } from '../../../lib/http.js';
import { participantHeader, readBotJson, resolveGuestAuth } from '../../../lib/trade/bot-auth.js';
import { LIMITS } from '../../../lib/trade/limits.js';

export async function POST(request) {
  const auth = await resolveGuestAuth(request);
  if (auth.err) return auth.err;
  const participantId = participantHeader(request);
  if (!participantId) return error(400, 'X-Trade-Participant header is required after join');
  const parsed = await readBotJson(request);
  if (parsed.err) return parsed.err;
  const status = typeof parsed.body.status === 'string' ? parsed.body.status.trim() : '';
  if (!status || status.length > LIMITS.maxStatusChars) {
    return error(400, `status is required (max ${LIMITS.maxStatusChars} chars)`);
  }
  const updated = await auth.trade.setParticipantStatus(auth.roomId, participantId, status);
  if (!updated) return error(403, 'Participant not found in this room');
  return json({ ok: true, participant: updated });
}
