import { createHash } from 'node:crypto';
import { safeEqual } from '../auth.js';

export function hashGuestKey(plaintext) {
  return createHash('sha256').update(String(plaintext), 'utf8').digest('hex');
}

/** Resolve a bearer guest key against hashed rows. Returns null if unknown or revoked. */
export async function matchGuestKey(rows, bearer) {
  if (!bearer || typeof bearer !== 'string') return null;
  const hash = hashGuestKey(bearer);
  for (const row of rows) {
    if (row.revokedAt) continue;
    if (await safeEqual(row.keyHash, hash)) return row;
  }
  return null;
}
