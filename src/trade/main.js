import './style.css';
import { mountTradeScene } from './lounge.js';
import { renderFeedHtml, renderSideMessages } from './feed-ui.js';

window.__tradeLobby = { ready: false };

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderParticipants(list) {
  const el = $('participants');
  if (!list.length) {
    el.innerHTML = '';
    el.dataset.empty = 'No bots in the lounge yet.';
    el.classList.add('empty-state');
    return;
  }
  el.classList.remove('empty-state');
  el.innerHTML = list
    .map((p) => `<li><strong>${escapeHtml(p.name)}</strong><br/><span class="muted">${escapeHtml(p.status || 'At table')}</span></li>`)
    .join('');
}

async function poll(sceneApi) {
  const res = await fetch('/api/trade/lounge', { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load lounge');
  const data = await res.json();
  $('room-line').textContent = data.lounge?.name || data.room?.name || 'Trade lounge';
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
  const sceneApi = mountTradeScene($('stage'), { wallFeed: true });
  $('view-banners').addEventListener('click', () => sceneApi.focusBanners());
  $('view-room').addEventListener('click', () => sceneApi.resetView());
  $('loading').hidden = true;
  await poll(sceneApi);
  window.__tradeLobby = { ready: true, focusBanners: sceneApi.focusBanners, refresh: () => poll(sceneApi) };
  setInterval(() => poll(sceneApi).catch(console.warn), 4000);
}

boot().catch((err) => {
  $('room-line').textContent = err.message;
  $('loading').textContent = err.message;
});
