import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFileStore } from '../../lib/store/file-store.js';
import { normalizeManagerPhoto, listManagers } from '../../lib/trade/managers.js';
import {
  PARTICIPANT_HIDE_AFTER_MS,
  filterVisibleParticipants,
  isParticipantVisible,
} from '../../lib/trade/participants.js';
import { resetTradeStoreCache } from '../../lib/trade/index.js';
import { resetStoreCache } from '../../lib/store/index.js';
import { resetRateLimitsForTests } from '../../lib/trade/limits.js';
import { gate, resetTradePublicAssetCache } from '../../lib/gate.js';

function freshStore() {
  resetStoreCache();
  resetTradeStoreCache();
  resetRateLimitsForTests();
  return createFileStore({ file: null });
}

test('manager manifest photos are valid paths', () => {
  const managers = listManagers();
  assert.ok(managers.length >= 15);
  for (const m of managers) {
    assert.match(m.photo, /^\/trade\/managers\/.+\.png$/i);
    assert.equal(normalizeManagerPhoto(m.photo), m.photo);
  }
  assert.equal(normalizeManagerPhoto('/trade/managers/nope.png'), null);
});

test('isParticipantVisible respects removed_at and 24h idle', () => {
  const now = new Date('2026-11-02T12:00:00.000Z');
  const fresh = { removedAt: null, lastSeen: '2026-11-02T11:30:00.000Z' };
  const stale = { removedAt: null, lastSeen: new Date(now.getTime() - PARTICIPANT_HIDE_AFTER_MS - 1000).toISOString() };
  const removed = { removedAt: '2026-11-01T00:00:00.000Z', lastSeen: fresh.lastSeen };
  assert.equal(isParticipantVisible(fresh, now), true);
  assert.equal(isParticipantVisible(stale, now), false);
  assert.equal(isParticipantVisible(removed, now), false);
  assert.equal(filterVisibleParticipants([fresh, stale, removed], now).length, 1);
});

test('removeParticipant soft-hides; touchParticipant restores', async () => {
  const store = freshStore();
  const trade = store.trade;
  const room = await trade.createRoom('Trade talks');
  const p = await trade.joinParticipant(room.id, 'Pickolas Cage');
  const all = await trade.listParticipants(room.id);
  assert.equal(all.length, 1);
  const removed = await trade.removeParticipant(room.id, p.id);
  assert.ok(removed?.removedAt);
  assert.equal(await trade.removeParticipant(room.id, p.id), null);
  assert.equal((await trade.listVisibleParticipants(room.id)).length, 0);
  const touched = await trade.touchParticipant(room.id, p.id);
  assert.equal(touched.removedAt, null);
  assert.equal((await trade.listVisibleParticipants(room.id)).length, 1);
});

test('setParticipantManager persists on key for re-join', async () => {
  const store = freshStore();
  const trade = store.trade;
  const room = await trade.createRoom('Trade talks');
  const { key, plaintext } = await trade.createKey(room.id, 'Chris bot');
  const chrisPhoto = listManagers().find((m) => m.name === 'Chris Rawlings').photo;
  const first = await trade.joinParticipant(room.id, 'Pickolas Cage', {
    guestKeyId: key.id,
    managerPhoto: null,
  });
  await trade.setParticipantManager(room.id, first.id, chrisPhoto);
  const keyRow = await trade.getKeyRow(key.id);
  assert.equal(keyRow.managerPhoto, chrisPhoto);
  const second = await trade.joinParticipant(room.id, 'Pickolas Cage again', {
    guestKeyId: key.id,
    managerPhoto: keyRow.managerPhoto,
  });
  assert.equal(second.managerPhoto, chrisPhoto);
  assert.notEqual(second.id, first.id);
});

test('gate allows public manager avatar paths', async () => {
  resetTradePublicAssetCache();
  const env = { OFFICE_PASSWORD: 'x' };
  const req = (path) => new Request(`https://example.com${path}`);
  assert.equal((await gate(req('/trade/managers/chris-avatar.png'), env)).action, 'next');
});
