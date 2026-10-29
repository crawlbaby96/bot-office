import { error, json } from '../../../lib/http.js';
import { participantHeader, readBotJson, resolveGuestAuth } from '../../../lib/trade/bot-auth.js';
import { canRespondToOffer } from '../../../lib/trade/offers.js';
import { LIMITS } from '../../../lib/trade/limits.js';

async function requireParticipant(request, auth) {
  const participantId = participantHeader(request);
  if (!participantId) return { err: error(400, 'X-Trade-Participant header is required after join') };
  const participant = await auth.trade.getParticipant(participantId, auth.roomId);
  if (!participant) return { err: error(403, 'Participant not found in this room') };
  return { participantId, participant };
}

export async function GET(request) {
  const auth = await resolveGuestAuth(request);
  if (auth.err) return auth.err;
  const url = new URL(request.url);
  const since = Math.max(0, Number(url.searchParams.get('since') || 0) || 0);
  const messages = await auth.trade.readMessages(auth.roomId, since);
  const offers = await auth.trade.listOffers(auth.roomId);
  const participants = await auth.trade.listParticipants(auth.roomId);
  const cursor = messages.length ? messages[messages.length - 1].id : since;
  return json({ roomId: auth.roomId, since, cursor, messages, offers, participants });
}

export async function POST(request) {
  const auth = await resolveGuestAuth(request);
  if (auth.err) return auth.err;
  const part = await requireParticipant(request, auth);
  if (part.err) return part.err;
  const parsed = await readBotJson(request);
  if (parsed.err) return parsed.err;
  const body = parsed.body;

  const count = await auth.trade.messageCount(auth.roomId);
  if (count >= LIMITS.messagesPerRoom) return error(429, 'Room message cap reached');

  if (body.offer && typeof body.offer === 'object') {
    const { give, want } = body.offer;
    const errMsg = auth.trade.validateOfferPayload({ give, want });
    if (errMsg) return error(400, errMsg);
    const offer = await auth.trade.createOffer(auth.roomId, part.participantId, { give, want });
    const msg = await auth.trade.appendOfferMessage(auth.roomId, part.participantId, offer.id);
    return json({ ok: true, message: msg, offer }, 201);
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return error(400, 'text or offer is required');
  if (text.length > LIMITS.maxMessageChars) return error(400, `text max ${LIMITS.maxMessageChars} chars`);
  const msg = await auth.trade.appendChat(auth.roomId, part.participantId, text);
  return json({ ok: true, message: msg }, 201);
}

export async function PUT(request) {
  const auth = await resolveGuestAuth(request);
  if (auth.err) return auth.err;
  const part = await requireParticipant(request, auth);
  if (part.err) return part.err;
  const parsed = await readBotJson(request);
  if (parsed.err) return parsed.err;
  const body = parsed.body;
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  const offerId = typeof body.offerId === 'string' ? body.offerId.trim() : '';
  if (!action || !offerId) return error(400, 'action and offerId are required');
  const offer = await auth.trade.getOffer(auth.roomId, offerId);
  if (!offer) return error(404, 'Offer not found');
  if (!canRespondToOffer(offer, part.participantId)) {
    return error(403, 'Cannot act on this offer');
  }

  if (action === 'accept') {
    auth.trade.transitionAccept(offer);
    const updated = await auth.trade.updateOfferState(auth.roomId, offerId, 'agreed');
    await auth.trade.appendChat(auth.roomId, part.participantId, `Accepted offer ${offerId}`);
    return json({ ok: true, offer: updated });
  }
  if (action === 'reject') {
    auth.trade.transitionReject(offer);
    const updated = await auth.trade.updateOfferState(auth.roomId, offerId, 'rejected');
    await auth.trade.appendChat(auth.roomId, part.participantId, `Rejected offer ${offerId}`);
    return json({ ok: true, offer: updated });
  }
  if (action === 'counter') {
    const { give, want } = body;
    const errMsg = auth.trade.validateOfferPayload({ give, want });
    if (errMsg) return error(400, errMsg);
    auth.trade.transitionCounter(offer);
    await auth.trade.updateOfferState(auth.roomId, offerId, 'countered');
    const counter = await auth.trade.createOffer(auth.roomId, part.participantId, {
      give,
      want,
      parentOfferId: offerId,
    });
    const msg = await auth.trade.appendOfferMessage(auth.roomId, part.participantId, counter.id);
    return json({ ok: true, offer: counter, message: msg, supersededOfferId: offerId }, 201);
  }
  return error(400, 'action must be accept, reject, or counter');
}
