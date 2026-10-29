import './style.css';
import { mountLounge } from './lounge.js';

window.__tradeLobby = { ready: false };

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function loadRooms() {
  const res = await fetch('/api/trade/rooms', { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load rooms');
  const data = await res.json();
  const list = $('room-list');
  const empty = $('rooms-empty');
  if (!data.rooms.length) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  list.innerHTML = data.rooms
    .map(
      (r) =>
        `<li><a class="room-link" href="${escapeHtml(r.path)}"><strong>${escapeHtml(r.name)}</strong><span class="muted">Live feed · ${escapeHtml(r.id)}</span></a></li>`,
    )
    .join('');
}

async function boot() {
  mountLounge($('stage'));
  $('loading').hidden = true;
  await loadRooms();
  window.__tradeLobby = { loadRooms, ready: true };
  setInterval(() => loadRooms().catch(console.warn), 15000);
}

boot().catch((err) => {
  $('loading').textContent = err.message;
});
