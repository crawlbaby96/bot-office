import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeFeedHealth, effectiveStatus, MAX_MESSAGE_LENGTH, validateStatus, validateUsage } from '../../lib/rules.js';

const ids = new Set(['a', 'b']);
const MIN = 60 * 1000;

test('validateStatus accepts a well-formed status and normalizes whitespace', () => {
  const r = validateStatus({ botId: 'a', state: 'Working', message: '  Reviewing\n the   batch ' }, ids);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { botId: 'a', state: 'working', message: 'Reviewing the batch', handoffTo: null });
});

test('validateStatus enforces the 80-character limit server-side', () => {
  assert.equal(validateStatus({ botId: 'a', state: 'idle', message: 'x'.repeat(MAX_MESSAGE_LENGTH) }, ids).ok, true);
  const r = validateStatus({ botId: 'a', state: 'idle', message: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) }, ids);
  assert.equal(r.ok, false);
  assert.match(r.error, /80 characters/);
});

test('validateStatus rejects unknown bots, states, and bad handoffs', () => {
  assert.equal(validateStatus({ botId: 'zzz', state: 'idle' }, ids).ok, false);
  assert.equal(validateStatus({ botId: 'a', state: 'sleeping' }, ids).ok, false);
  assert.equal(validateStatus({ botId: 'a', state: 'done', handoffTo: 'zzz' }, ids).ok, false);
  assert.equal(validateStatus({ botId: 'a', state: 'done', handoffTo: 'a' }, ids).ok, false);
  assert.equal(validateStatus({ botId: 'a', state: 'done', handoffTo: 'b' }, ids).value.handoffTo, 'b');
});

test('working goes stale (shown idle) after 10 minutes; waiting after 48 hours; other states do not', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const row = (state, ago) => ({ botId: 'a', state, message: '', handoffTo: null, updatedAt: new Date(now - ago).toISOString() });
  assert.equal(effectiveStatus(row('working', 9 * MIN), now).effectiveState, 'working');
  const stale = effectiveStatus(row('working', 10 * MIN), now);
  assert.equal(stale.effectiveState, 'idle');
  assert.equal(stale.stale, true);
  assert.equal(effectiveStatus(row('waiting', 60 * MIN), now).effectiveState, 'waiting');
  const staleWait = effectiveStatus(row('waiting', 48 * 60 * MIN), now);
  assert.equal(staleWait.effectiveState, 'idle');
  assert.equal(staleWait.stale, true);
  assert.equal(effectiveStatus(row('error', 60 * MIN), now).effectiveState, 'error');
});

test('validateUsage accepts percentLeft or used/limit and validates dates', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const a = validateUsage({ percentLeft: 62, resetsAt: '2026-11-02T16:00:00Z', readAt: '2026-10-29T11:00:00Z' }, now);
  assert.equal(a.ok, true);
  assert.equal(a.value.percentLeft, 62);
  const b = validateUsage({ used: 380, limit: 1000 }, now);
  assert.equal(b.value.percentLeft, 62);
  assert.equal(b.value.readAt, new Date(now).toISOString());
  assert.equal(validateUsage({ percentLeft: 101 }, now).ok, false);
  assert.equal(validateUsage({}, now).ok, false);
  assert.equal(validateUsage({ percentLeft: 5, resetsAt: 'next week' }, now).ok, false);
  assert.equal(validateUsage({ percentLeft: 5, readAt: '2026-10-30T12:00:00Z' }, now).ok, false);
});

test('feed health: idle office is fine; warns on store failure, failed or stopped heartbeat, and 45+ min without a push', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const ago = (m) => new Date(now - m * MIN).toISOString();
  const beat = (m, ok = true) => ({ checkedAt: ago(m), ok, detail: ok ? 'ok' : 'boom' });

  assert.equal(computeFeedHealth({ nowMs: now, lastPushAt: null, lastHeartbeat: null, firstHeartbeatAt: null }).ok, true);
  assert.equal(computeFeedHealth({ nowMs: now, lastPushAt: ago(44), lastHeartbeat: beat(3), firstHeartbeatAt: ago(500) }).ok, true);

  const quiet = computeFeedHealth({ nowMs: now, lastPushAt: ago(46), lastHeartbeat: beat(3), firstHeartbeatAt: ago(500) });
  assert.equal(quiet.ok, false);
  assert.match(quiet.warnings[0], /No status push received for 46 minutes/);

  assert.match(computeFeedHealth({ nowMs: now, lastPushAt: null, lastHeartbeat: beat(3), firstHeartbeatAt: ago(50) }).warnings[0], /No status push has been received yet/);
  assert.equal(computeFeedHealth({ nowMs: now, lastPushAt: null, lastHeartbeat: beat(3), firstHeartbeatAt: ago(30) }).ok, true);
  assert.match(computeFeedHealth({ nowMs: now, lastPushAt: ago(1), lastHeartbeat: beat(3, false) }).warnings[0], /heartbeat failed/);
  assert.match(computeFeedHealth({ nowMs: now, lastPushAt: ago(1), lastHeartbeat: beat(30) }).warnings[0], /heartbeat has stopped/);
  assert.match(computeFeedHealth({ nowMs: now, storeError: true }).warnings[0], /store could not be read/);
});
