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
  renderKeys(data.keys || []);
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
