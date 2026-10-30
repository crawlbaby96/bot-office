import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFileStore } from '../../lib/store/file-store.js';
import { hashGuestKey, matchGuestKey } from '../../lib/trade/keys.js';
import { resetRateLimitsForTests } from '../../lib/trade/limits.js';
import {
  canRespondToOffer,
  transitionAccept,
  transitionCounter,
  transitionReject,
  validateOfferPayload,
} from '../../lib/trade/offers.js';
import { resetTradeStoreCache } from '../../lib/trade/index.js';
import { resetStoreCache } from '../../lib/store/index.js';

test('offer state machine accept reject counter', () => {
  const open = {
    id: 'off_1',
    state: 'open',
    fromParticipantId: 'part_a',
    give: [{ asset: 'RB', qty: 1 }],
    want: [{ asset: 'WR', qty: 1 }],
  };
  assert.equal(canRespondToOffer(open, 'part_b'), true);
  assert.equal(canRespondToOffer(open, 'part_a'), false);
  assert.equal(transitionAccept(open).state, 'agreed');
  assert.equal(transitionReject(open).state, 'rejected');
  const counter = transitionCounter(open);
  assert.equal(counter.parent.state, 'countered');
  assert.throws(() => transitionAccept({ ...open, state: 'agreed' }), /not open/);
});

test('validateOfferPayload', () => {
  assert.equal(validateOfferPayload({ give: [], want: [] }), 'give and want cannot both be empty');
  assert.equal(validateOfferPayload({ give: [{ asset: 'X' }], want: [{ asset: 'Y' }] }), null);
});

test('guest key hash matches and revoked keys fail', async () => {
  const plain = 'gk_test_secret_value_123456789012345678901234';
  const hash = hashGuestKey(plain);
  const row = { keyHash: hash, revokedAt: null };
  assert.ok(await matchGuestKey([row], plain));
  assert.equal(await matchGuestKey([row], 'gk_wrong'), null);
  assert.equal(await matchGuestKey([{ ...row, revokedAt: new Date().toISOString() }], plain), null);
});

test('room isolation via guest keys', async () => {
  resetStoreCache();
  resetTradeStoreCache();
  resetRateLimitsForTests();
  const store = createFileStore({ file: null });
  const trade = store.trade;
  const roomA = await trade.createRoom('Room A');
  const roomB = await trade.createRoom('Room B');
  const { plaintext: keyA } = await trade.createKey(roomA.id, 'bot-a');
  const { plaintext: keyB } = await trade.createKey(roomB.id, 'bot-b');

  const rows = await trade.listActiveKeyRows();
  const matchA = await matchGuestKey(rows, keyA);
  const matchB = await matchGuestKey(rows, keyB);
  assert.equal(matchA.roomId, roomA.id);
  assert.equal(matchB.roomId, roomB.id);

  const partA = await trade.joinParticipant(roomA.id, 'Bot A');
  await trade.appendChat(roomA.id, partA.id, 'hello A');
  const msgsB = await trade.readMessages(roomB.id, 0);
  assert.equal(msgsB.length, 0);
  const msgsA = await trade.readMessages(roomA.id, 0);
  assert.ok(msgsA.some((m) => m.body.text === 'hello A'));
});
