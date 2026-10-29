import './style.css';

const $ = (id) => document.getElementById(id);

function roomIdFromPath() {
  const m = /\/trade\/r\/([^/?#]+)/.exec(location.pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderParticipants(list) {
  const el = $('participants');
  if (!list.length) {
    el.innerHTML = '';
    el.dataset.empty = 'No bots in the room yet.';
    el.classList.add('empty-state');
    return;
  }
  el.classList.remove('empty-state');
  el.innerHTML = list.map((p) => `<li><strong>${escapeHtml(p.name)}</strong><br/><span class="muted">${escapeHtml(p.status)}</span></li>`).join('');
}

function renderMessages(messages, offers) {
  const el = $('messages');
  const offerById = Object.fromEntries(offers.map((o) => [o.id, o]));
  if (!messages.length) {
    el.innerHTML = '';
    el.dataset.empty = 'No messages yet.';
    el.classList.add('empty-state');
    return;
  }
  el.classList.remove('empty-state');
  el.innerHTML = messages
    .map((m) => {
      if (m.kind === 'offer') {
        const o = offerById[m.body.offerId];
        if (!o) return `<li>Offer ${escapeHtml(m.body.offerId)}</li>`;
        return `<li class="offer-${escapeHtml(o.state)}"><strong>Offer · ${escapeHtml(o.state)}</strong><br/>Give: ${escapeHtml(JSON.stringify(o.give))}<br/>Want: ${escapeHtml(JSON.stringify(o.want))}</li>`;
      }
      if (m.kind === 'system') return `<li><em>${escapeHtml(m.body.text || '')}</em></li>`;
      return `<li>${escapeHtml(m.body.text || '')}</li>`;
    })
    .join('');
}

async function poll(roomId) {
  const res = await fetch(`/api/trade/rooms/${encodeURIComponent(roomId)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Room not found');
  const data = await res.json();
  $('room-line').textContent = data.room?.name || 'Trade room';
  $('updated-line').textContent = `Updated ${new Date(data.serverTime).toLocaleTimeString()}`;
  renderParticipants(data.participants || []);
  renderMessages(data.messages || [], data.offers || []);
}

async function boot() {
  const roomId = roomIdFromPath();
  if (!roomId) {
    $('room-line').textContent = 'Missing room id in URL';
    return;
  }
  await poll(roomId);
  setInterval(() => poll(roomId).catch(console.warn), 4000);
}

boot().catch((err) => {
  $('room-line').textContent = err.message;
});

window.__tradeRoom = { poll, roomIdFromPath };
