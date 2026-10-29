/** Pure offer state transitions for unit tests and API handlers. */

export const OFFER_STATES = new Set(['open', 'rejected', 'countered', 'agreed']);

export function assertOpen(offer) {
  if (!offer || offer.state !== 'open') throw Object.assign(new Error('Offer is not open'), { status: 409 });
}

export function canRespondToOffer(offer, actorParticipantId) {
  return offer?.state === 'open' && offer.fromParticipantId !== actorParticipantId;
}

export function transitionAccept(offer, now = new Date()) {
  assertOpen(offer);
  return { ...offer, state: 'agreed', updatedAt: now.toISOString() };
}

export function transitionReject(offer, now = new Date()) {
  assertOpen(offer);
  return { ...offer, state: 'rejected', updatedAt: now.toISOString() };
}

export function transitionCounter(parentOffer, now = new Date()) {
  assertOpen(parentOffer);
  return {
    parent: { ...parentOffer, state: 'countered', updatedAt: now.toISOString() },
  };
}

export function validateOfferPayload({ give, want }) {
  if (!Array.isArray(give) || !Array.isArray(want)) return 'give and want must be arrays';
  if (give.length === 0 && want.length === 0) return 'give and want cannot both be empty';
  const line = (x, i, side) => {
    if (x == null || typeof x !== 'object') return `${side}[${i}] must be an object`;
    if (typeof x.asset !== 'string' || !x.asset.trim()) return `${side}[${i}].asset is required`;
    if (x.qty != null && (typeof x.qty !== 'number' || !Number.isFinite(x.qty) || x.qty <= 0)) return `${side}[${i}].qty must be a positive number`;
    return null;
  };
  for (let i = 0; i < give.length; i++) {
    const err = line(give[i], i, 'give');
    if (err) return err;
  }
  for (let i = 0; i < want.length; i++) {
    const err = line(want[i], i, 'want');
    if (err) return err;
  }
  return null;
}
