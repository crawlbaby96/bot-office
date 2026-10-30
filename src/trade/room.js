import './style.css';
import { mountTradeScene } from './lounge.js';
import { renderFeedHtml, renderSideMessages } from './feed-ui.js';

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
  el.innerHTML = list
    .map((p) => `<li><strong>${escapeHtml(p.name)}</strong><br/><span class="muted">${escapeHtml(p.status || 'At table')}</span></li>`)
    .join('');
}

async function poll(roomId, sceneApi) {
  const res = await fetch(`/api/trade/rooms/${encodeURIComponent(roomId)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Room not found');
  const data = await res.json();
  $('room-line').textContent = data.room?.name || 'Trade room';
  $('updated-line').textContent = `Updated ${new Date(data.serverTime).toLocaleTimeString()}`;
  const participants = data.participants || [];
  renderParticipants(participants);
  sceneApi.syncParticipants(participants);
  const feedHtml = renderFeedHtml(data.messages || [], data.offers || [], participants);
  sceneApi.setWallFeedHtml(feedHtml);
  const el = $('messages');
  const side = renderSideMessages(data.messages || [], data.offers || [], participants);
  if (!side) {
    el.innerHTML = '';
    el.dataset.empty = 'No messages yet.';
    el.classList.add('empty-state');
  } else {
    el.classList.remove('empty-state');
    el.innerHTML = side;
  }
}

async function boot() {
  const roomId = roomIdFromPath();
  if (!roomId) {
    $('room-line').textContent = 'Missing room id in URL';
    return;
  }
  const sceneApi = mountTradeScene($('stage'), { wallFeed: true });
  $('loading').hidden = true;
  await poll(roomId, sceneApi);
  setInterval(() => poll(roomId, sceneApi).catch(console.warn), 4000);
}

boot().catch((err) => {
  $('room-line').textContent = err.message;
});

window.__tradeRoom = { roomIdFromPath };
