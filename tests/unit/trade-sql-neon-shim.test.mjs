import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createTradeSqlMethods } from '../../lib/trade/sql-methods.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Mimics @neondatabase/serverless: tagged templates run; `.unsafe` is not a query executor. */
function createTemplateOnlySql(state) {
  const sql = async (strings, ...values) => {
    const text = String.raw({ raw: strings }, ...values);
    if (text.includes('FROM trade_participants WHERE room_id')) {
      return [...state.participants.values()].filter((p) => p.room_id === values[values.length - 1]);
    }
    if (text.includes('FROM trade_participants WHERE id')) {
      const id = values[0];
      const roomId = values[1];
      const row = state.participants.get(id);
      return row && row.room_id === roomId ? [row] : [];
    }
    if (text.includes('UPDATE trade_participants SET last_seen')) {
      const participantId = values[0];
      const roomId = values[1];
      const row = state.participants.get(participantId);
      if (!row || row.room_id !== roomId) return [];
      row.last_seen = new Date();
      row.removed_at = null;
      return [row];
    }
    if (text.includes('UPDATE trade_participants SET removed_at')) {
      const participantId = values[0];
      const roomId = values[1];
      const row = state.participants.get(participantId);
      if (!row || row.room_id !== roomId || row.removed_at) return [];
      row.removed_at = new Date();
      return [row];
    }
    if (text.includes('UPDATE trade_participants SET manager_photo')) {
      const participantId = values[1];
      const roomId = values[2];
      const row = state.participants.get(participantId);
      if (!row || row.room_id !== roomId) return [];
      row.manager_photo = values[0];
      return [row];
    }
    if (text.includes('UPDATE trade_participants SET status')) {
      const participantId = values[1];
      const roomId = values[2];
      const row = state.participants.get(participantId);
      if (!row || row.room_id !== roomId) return [];
      row.status = values[0];
      row.last_seen = new Date();
      row.removed_at = null;
      return [row];
    }
    if (text.includes('UPDATE trade_room_keys SET manager_photo')) return [];
    throw new Error(`unexpected query: ${text.slice(0, 80)}`);
  };
  sql.unsafe = () => ({ __neonSqlFragment: true });
  return sql;
}

test('trade sql-methods do not use sql.unsafe (Neon-compatible)', () => {
  for (const rel of ['lib/trade/sql-methods.js', 'lib/store/sql-store.js']) {
    const src = readFileSync(join(repoRoot, rel), 'utf8');
    assert.doesNotMatch(src, /sql\.unsafe/, `${rel} must use tagged templates only`);
  }
});

test('trade participant SQL works with template-only driver (Neon semantics)', async () => {
  const roomId = 'room_test';
  const participantId = 'part_test';
  const state = {
    participants: new Map([
      [
        participantId,
        {
          id: participantId,
          room_id: roomId,
          name: 'Alpha',
          status: 'online',
          joined_at: new Date('2026-11-01T00:00:00Z'),
          last_seen: new Date('2026-11-01T00:00:00Z'),
          removed_at: null,
          guest_key_id: null,
          manager_photo: null,
        },
      ],
    ]),
  };
  const trade = createTradeSqlMethods(createTemplateOnlySql(state));
  const listed = await trade.listParticipants(roomId);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].name, 'Alpha');

  const touched = await trade.touchParticipant(roomId, participantId);
  assert.ok(touched.lastSeen);
  assert.equal(touched.removedAt, null);

  const removed = await trade.removeParticipant(roomId, participantId);
  assert.ok(removed.removedAt);
  assert.equal((await trade.listVisibleParticipants(roomId)).length, 0);

  const status = await trade.setParticipantStatus(roomId, participantId, 'Away');
  assert.equal(status.status, 'Away');
});
