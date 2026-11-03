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

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

let managersCatalog = [];

function renderKeys(keys) {
  const el = $('keys');
  if (!keys.length) {
    el.innerHTML = '<li class="muted">No keys yet.</li>';
    return;
  }
  el.innerHTML = keys
    .map(
      (k) =>
        `<li>${escapeHtml(k.label)} · ${k.revoked ? 'revoked' : 'active'} ${k.revoked ? '' : `<button type="button" data-revoke="${escapeHtml(k.id)}">Revoke</button>`}</li>`,
    )
    .join('');
  el.querySelectorAll('[data-revoke]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api('/api/trade/admin/keys', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keyId: btn.dataset.revoke }),
      });
      await refresh();
    });
  });
}

function managerOptions(selected) {
  const opts = ['<option value="">— no manager —</option>'];
  for (const m of managersCatalog) {
    const sel = m.photo === selected ? ' selected' : '';
    opts.push(`<option value="${escapeHtml(m.photo)}"${sel}>${escapeHtml(m.name)}</option>`);
  }
  return opts.join('');
}

function renderParticipants(participants) {
  const el = $('participants-admin');
  const active = participants.filter((p) => !p.removed);
  if (!active.length) {
    el.innerHTML = '<p class="muted">No lounge bots yet.</p>';
    return;
  }
  el.innerHTML = `<table class="participants-table">
    <thead><tr><th>Bot</th><th>Status</th><th>Last seen</th><th>Manager</th><th></th></tr></thead>
    <tbody>${active
      .map((p) => {
        const hidden = !p.visible ? '<div class="participant-hidden-note">Hidden (idle 24h+ or removed)</div>' : '';
        return `<tr data-participant="${escapeHtml(p.id)}">
          <td><strong>${escapeHtml(p.name)}</strong>${hidden}</td>
          <td>${escapeHtml(p.status || 'online')}</td>
          <td>${escapeHtml(formatWhen(p.lastSeen))}</td>
          <td><select class="manager-picker" data-manager-for="${escapeHtml(p.id)}">${managerOptions(p.managerPhoto)}</select></td>
          <td><button type="button" class="remove-participant" data-remove="${escapeHtml(p.id)}">Remove</button></td>
        </tr>`;
      })
      .join('')}</tbody></table>`;

  el.querySelectorAll('.manager-picker').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const participantId = sel.dataset.managerFor;
      const managerPhoto = sel.value || null;
      await api('/api/trade/admin/participants', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ participantId, managerPhoto }),
      });
      await refresh();
    });
  });

  el.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Remove ${btn.closest('tr')?.querySelector('strong')?.textContent || 'this bot'} from the live lounge?`)) return;
      await api('/api/trade/admin/participants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ participantId: btn.dataset.remove }),
      });
      await refresh();
    });
  });
}

function showKey(label, key) {
  $('key-reveal-label').textContent = label;
  $('key-reveal-value').value = key;
  $('key-reveal-status').textContent = '';
  $('key-reveal').hidden = false;
  $('key-reveal-value').select();
}

function hideKey() {
  $('key-reveal-value').value = '';
  $('key-reveal').hidden = true;
}

async function refresh() {
  const data = await api('/api/trade/admin/rooms');
  const lounge = data.lounge;
  $('lounge-line').textContent = lounge
    ? `Public lounge: ${lounge.name} · ${location.origin}${lounge.path}`
    : '';
  managersCatalog = data.managers || [];
  renderKeys(data.keys || []);
  renderParticipants(data.participants || []);
}

async function boot() {
  $('key-reveal-copy').addEventListener('click', async () => {
    const input = $('key-reveal-value');
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select();
      document.execCommand('copy');
    }
    $('key-reveal-status').textContent = 'Copied';
  });
  $('key-reveal-done').addEventListener('click', hideKey);
  $('key-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = new FormData(e.target).get('label');
    const out = await api('/api/trade/admin/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    e.target.reset();
    await refresh();
    showKey(label, out.guestKey);
  });
  await refresh();
  $('loading').hidden = true;
}

boot().catch((err) => {
  $('loading').textContent = err.message;
});
