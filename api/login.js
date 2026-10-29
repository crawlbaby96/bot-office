import { createSessionToken, safeEqual, sessionCookie } from '../lib/auth.js';
import { clientIp, error, json, sleep } from '../lib/http.js';

// Best-effort per-instance throttle; every failure also waits at least FAILURE_DELAY_MS.
const FAILURE_DELAY_MS = 1000;
const failures = new Map();

function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/api/')) return '/';
  return value;
}

async function readCredentials(request) {
  const type = request.headers.get('content-type') || '';
  const text = (await request.text()).slice(0, 4096);
  if (type.includes('application/json')) {
    try {
      const body = JSON.parse(text || '{}');
      return { password: body.password, next: body.next, wantsJson: true };
    } catch {
      return { password: null, next: '/', wantsJson: true };
    }
  }
  const form = new URLSearchParams(text);
  return { password: form.get('password'), next: form.get('next'), wantsJson: false };
}

export async function POST(request) {
  const expected = process.env.OFFICE_PASSWORD;
  if (!expected) return error(503, 'OFFICE_PASSWORD is not configured');

  const ip = clientIp(request);
  const { password, next, wantsJson } = await readCredentials(request);
  const ok = typeof password === 'string' && (await safeEqual(password, expected));
  const secure = new URL(request.url).protocol === 'https:';

  if (!ok) {
    const prev = failures.get(ip) || { count: 0, at: 0 };
    const count = Date.now() - prev.at > 15 * 60 * 1000 ? 1 : prev.count + 1;
    failures.set(ip, { count, at: Date.now() });
    if (failures.size > 5000) failures.clear();
    await sleep(FAILURE_DELAY_MS + Math.min(count - 1, 8) * 500 + Math.floor(Math.random() * 250));
    if (wantsJson) return error(401, 'Incorrect password');
    const q = new URLSearchParams({ error: '1' });
    if (next && safeNext(next) !== '/') q.set('next', safeNext(next));
    return new Response(null, { status: 303, headers: { Location: `/login?${q}`, 'Cache-Control': 'no-store' } });
  }

  failures.delete(ip);
  const cookie = sessionCookie(await createSessionToken(process.env), { secure });
  if (wantsJson) return json({ ok: true }, 200, { 'Set-Cookie': cookie });
  return new Response(null, {
    status: 303,
    headers: { Location: safeNext(next), 'Set-Cookie': cookie, 'Cache-Control': 'no-store' },
  });
}
