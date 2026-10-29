/** HTML for trade wall screen and side panels (readable offers, not raw JSON). */

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function formatAssetLine(item) {
  const qty = item.qty != null ? item.qty : 1;
  const asset = String(item.asset || '').trim();
  return `${qty}× ${asset}`;
}

export function formatAssetList(items) {
  if (!items?.length) return '—';
  return items.map(formatAssetLine).join(', ');
}

export function participantName(map, id) {
  if (!id) return 'Unknown';
  return map[id]?.name || 'Unknown';
}

export function renderOfferCard(offer, nameById) {
  const from = participantName(nameById, offer.fromParticipantId);
  const state = offer.state || 'open';
  const stateLabel = state.charAt(0).toUpperCase() + state.slice(1);
  const gives = formatAssetList(offer.give);
  const wants = formatAssetList(offer.want);
  return `<article class="trade-offer-card offer-${escapeHtml(state)}">
    <header><span class="trade-offer-from">${escapeHtml(from)}</span> proposes</header>
    <div class="trade-offer-legs">
      <div><span class="label">Gives</span> ${escapeHtml(gives)}</div>
      <div><span class="label">Wants</span> ${escapeHtml(wants)}</div>
    </div>
    <span class="trade-offer-badge">${escapeHtml(stateLabel)}</span>
  </article>`;
}

export function renderFeedHtml(messages, offers, participants) {
  const nameById = Object.fromEntries((participants || []).map((p) => [p.id, p]));
  const offerById = Object.fromEntries((offers || []).map((o) => [o.id, o]));
  if (!messages?.length) {
    return '<p class="trade-wall-empty">No messages yet — bots will chat and post offers here.</p>';
  }
  const parts = messages.map((m) => {
    if (m.kind === 'offer') {
      const o = offerById[m.body.offerId];
      if (!o) return `<p class="trade-wall-line muted">Offer ${escapeHtml(m.body.offerId)}</p>`;
      return renderOfferCard(o, nameById);
    }
    if (m.kind === 'system') {
      return `<p class="trade-wall-line system"><em>${escapeHtml(m.body.text || '')}</em></p>`;
    }
    const who = participantName(nameById, m.participantId);
    return `<p class="trade-wall-line"><strong>${escapeHtml(who)}</strong> ${escapeHtml(m.body.text || '')}</p>`;
  });
  return `<div class="trade-wall-scroll">${parts.join('')}</div>`;
}

export function renderSideMessages(messages, offers, participants) {
  const nameById = Object.fromEntries((participants || []).map((p) => [p.id, p]));
  const offerById = Object.fromEntries((offers || []).map((o) => [o.id, o]));
  if (!messages?.length) return '';
  return messages
    .map((m) => {
      if (m.kind === 'offer') {
        const o = offerById[m.body.offerId];
        if (!o) return `<li>Offer ${escapeHtml(m.body.offerId)}</li>`;
        return `<li>${renderOfferCard(o, nameById)}</li>`;
      }
      if (m.kind === 'system') return `<li><em>${escapeHtml(m.body.text || '')}</em></li>`;
      return `<li>${escapeHtml(m.body.text || '')}</li>`;
    })
    .join('');
}
