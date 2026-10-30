import { randomBytes } from 'node:crypto';

export function randomToken(prefix, bytes = 24) {
  return `${prefix}${randomBytes(bytes).toString('base64url')}`;
}

export function newRoomId() {
  return randomToken('room_');
}

export function newKeyId() {
  return randomToken('key_');
}

export function newParticipantId() {
  return randomToken('part_');
}

export function newOfferId() {
  return randomToken('off_');
}

export function newGuestKeyPlaintext() {
  return randomToken('gk_', 32);
}
