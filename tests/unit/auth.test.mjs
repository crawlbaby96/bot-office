import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkBearer, createSessionToken, parseCookies, safeEqual, sessionCookie, verifySessionToken } from '../../lib/auth.js';
import { gate } from '../../lib/gate.js';

const env = { OFFICE_PASSWORD: 'correct horse' };

test('safeEqual compares exactly', async () => {
  assert.equal(await safeEqual('abc', 'abc'), true);
  assert.equal(await safeEqual('abc', 'abd'), false);
  assert.equal(await safeEqual('abc', 'abcd'), false);
  assert.equal(await safeEqual('', null), false);
});

test('session tokens verify, expire, and are invalidated by a password change', async () => {
  const now = Date.now();
  const token = await createSessionToken(env, now);
  assert.equal(await verifySessionToken(env, token, now), true);
  assert.equal(await verifySessionToken(env, token, now + 31 * 86400000), false);
  assert.equal(await verifySessionToken({ OFFICE_PASSWORD: 'other' }, token, now), false);
  const [v, exp, sig] = token.split('.');
  assert.equal(await verifySessionToken(env, `${v}.${Number(exp) + 1000}.${sig}`, now), false);
  assert.equal(await verifySessionToken(env, 'garbage', now), false);
});

test('session cookie is httpOnly, SameSite=Lax, and Secure on https', () => {
  const c = sessionCookie('t', { secure: true });
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Secure/);
  assert.doesNotMatch(sessionCookie('t', { secure: false }), /Secure/);
  assert.deepEqual(parseCookies('a=1; office_session=x.y.z'), { a: '1', office_session: 'x.y.z' });
});

test('bearer check', async () => {
  const req = (h) => new Request('http://x/api/status', { method: 'POST', headers: h ? { authorization: h } : {} });
  assert.equal(await checkBearer(req('Bearer tok'), 'tok'), true);
  assert.equal(await checkBearer(req('Bearer nope'), 'tok'), false);
  assert.equal(await checkBearer(req(null), 'tok'), false);
  assert.equal(await checkBearer(req('Bearer tok'), undefined), false);
});

test('gate: pages redirect, read APIs 401, machine routes pass to their own auth, session unlocks everything', async () => {
  const req = (path, method = 'GET', cookie) => new Request(`http://x${path}`, { method, headers: cookie ? { cookie } : {} });
  assert.deepEqual(await gate(req('/'), env), { action: 'redirect', location: '/login' });
  assert.equal((await gate(req('/assets/index.js'), env)).action, 'redirect');
  assert.equal((await gate(req('/api/office'), env)).status, 401);
  assert.equal((await gate(req('/api/status'), env)).status, 401);
  assert.equal((await gate(req('/api/status', 'POST'), env)).action, 'next');
  assert.equal((await gate(req('/api/usage', 'POST'), env)).action, 'next');
  assert.equal((await gate(req('/api/cron/heartbeat'), env)).action, 'next');
  assert.equal((await gate(req('/login'), env)).action, 'next');
  assert.equal((await gate(req('/'), {})).status, 503);
  const cookie = `office_session=${await createSessionToken(env)}`;
  assert.equal((await gate(req('/', 'GET', cookie), env)).action, 'next');
  assert.equal((await gate(req('/api/office', 'GET', cookie), env)).action, 'next');
});
