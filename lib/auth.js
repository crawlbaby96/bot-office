// Web Crypto only: shared by the Edge routing middleware and the Node API functions.

export const SESSION_COOKIE = 'office_session';
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;

const enc = new TextEncoder();

function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(keyMaterial, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(keyMaterial), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

async function sha256(s) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(s))));
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Hashing both sides first makes the comparison length-independent as well as constant-time.
export async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([sha256(a ?? ''), sha256(b ?? '')]);
  return bytesEqual(ha, hb) && typeof a === 'string' && typeof b === 'string';
}

function sessionKey(env) {
  const secret = env.SESSION_SECRET || env.OFFICE_PASSWORD;
  if (!secret) return null;
  // Changing OFFICE_PASSWORD (or SESSION_SECRET) invalidates every existing session.
  return `office-session:v1:${secret}:${env.OFFICE_PASSWORD ?? ''}`;
}

export async function createSessionToken(env, nowMs = Date.now()) {
  const key = sessionKey(env);
  if (!key) throw new Error('OFFICE_PASSWORD is not configured');
  const exp = Math.floor(nowMs / 1000) + SESSION_MAX_AGE_SEC;
  const payload = `v1.${exp}`;
  return `${payload}.${b64url(await hmac(key, payload))}`;
}

export async function verifySessionToken(env, token, nowMs = Date.now()) {
  const key = sessionKey(env);
  if (!key || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp * 1000 < nowMs) return false;
  const expected = b64url(await hmac(key, `v1.${parts[1]}`));
  return safeEqual(expected, parts[2]);
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function hasValidSession(request, env) {
  const token = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
  return verifySessionToken(env, token);
}

export function sessionCookie(token, { secure }) {
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
    secure ? 'Secure' : null,
  ].filter(Boolean).join('; ');
}

export function clearSessionCookie({ secure }) {
  return [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', secure ? 'Secure' : null]
    .filter(Boolean).join('; ');
}

export function bearerToken(request) {
  const h = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

export async function checkBearer(request, expected) {
  if (!expected) return false;
  const got = bearerToken(request);
  if (!got) return false;
  return safeEqual(got, expected);
}
