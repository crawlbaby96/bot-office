import { error, json } from '../../../lib/http.js';
import { readBotJson, resolveGuestAuth } from '../../../lib/trade/bot-auth.js';
import { LIMITS, takeRate } from '../../../lib/trade/limits.js';

export async function POST(request) {
  const auth = await resolveGuestAuth(request);
  if (auth.err) return auth.err;
  const parsed = await readBotJson(request);
  if (parsed.err) return parsed.err;
  const body = parsed.body;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 64) return error(400, 'name is required (max 64 chars)');
  if (!takeRate(`trade:join:${auth.keyId}`, { limit: LIMITS.joinPerKeyPerMinute })) {
    return error(429, 'Rate limit exceeded');
  }
  const participant = await auth.trade.joinParticipant(auth.roomId, name);
  return json(
    {
      ok: true,
      roomId: auth.roomId,
      participantId: participant.id,
      participant,
      auth: { useHeader: 'X-Trade-Participant', participantId: participant.id },
    },
    201,
  );
}
