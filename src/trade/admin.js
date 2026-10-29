import './style.css';

const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...opts });
  if (res.status === 401) {
    location.href = `/login?next=${encodeURIComponent('/trade/admin')}`;
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderRooms(rooms) {
  const el = $('rooms');
  if (!rooms.length) {
    el.innerHTML = '<p class="muted empty">No trade rooms yet.</p>';
    return;
  }
  el.innerHTML = rooms
    .map(
      (room) => `
    <div class="room-card" data-room="${escapeHtml(room.id)}">
      <strong>${escapeHtml(room.name)}</strong>
      <div>Public: <a href="${escapeHtml(room.path)}">${escapeHtml(location.origin + room.path)}</a></div>
      <button type="button" class="delete-room">Delete room</button>
      <form class="key-form">
        <input name="label" placeholder="Key label (e.g. Forge bot)" maxlength="80" required />
        <button type="submit">Issue guest key</button>
      </form>
      <ul class="keys">${room.keys
        .map(
          (k) =>
            `<li>${escapeHtml(k.label)} · ${k.revoked ? 'revoked' : 'active'} ${k.revoked ? '' : `<button type="button" data-revoke="${escapeHtml(k.id)}">Revoke</button>`}</li>`,
        )
        .join('') || '<li class="muted">No keys yet</li>'}</ul>
    </div>`,
    )
    .join('');

  el.querySelectorAll('.key-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const card = form.closest('.room-card');
      const roomId = card.dataset.room;
      const label = new FormData(form).get('label');
      const out = await api('/api/trade/admin/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomId, label }),
      });
      const once = document.createElement('div');
      once.className = 'key-once';
      once.textContent = `Guest key (copy now): ${out.guestKey}`;
      form.append(once);
      form.reset();
      await refreshRooms();
    });
  });

  el.querySelectorAll('[data-revoke]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const roomId = btn.closest('.room-card').dataset.room;
      await api('/api/trade/admin/keys', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomId, keyId: btn.dataset.revoke }),
      });
      await refreshRooms();
    });
  });

  el.querySelectorAll('.delete-room').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.room-card');
      const roomId = card.dataset.room;
      if (!confirm(`Delete room ${roomId}?`)) return;
      await api('/api/trade/admin/rooms', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      await refreshRooms();
    });
  });
}

async function refreshRooms() {
  const data = await api('/api/trade/admin/rooms');
  renderRooms(data.rooms);
}

async function boot() {
  $('create-room').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name');
    await api('/api/trade/admin/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    e.target.reset();
    await refreshRooms();
  });
  await refreshRooms();
  $('loading').hidden = true;
}

boot().catch((err) => {
  $('loading').textContent = err.message;
});
