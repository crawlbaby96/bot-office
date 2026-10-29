import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { test } from 'node:test';
import { createFileStore } from '../../lib/store/file-store.js';
import { buildLayout, ELEVATOR_SPOTS } from '../../src/scene/layout.js';
import { route } from '../../src/scene/nav.js';

test('file store starts empty and round-trips statuses, usage and heartbeats', async () => {
  const file = '/tmp/office-unit-store.json';
  rmSync(file, { force: true });
  const store = createFileStore({ file });
  assert.deepEqual(await store.listStatuses(), []);
  assert.equal(await store.latestUsage(), null);
  assert.deepEqual(await store.feedInfo(), { lastPushAt: null, lastHeartbeat: null, firstHeartbeatAt: null });

  const t1 = new Date('2026-10-29T10:00:00Z');
  await store.putStatus({ botId: 'a', state: 'working', message: 'm', handoffTo: null }, t1);
  await store.putStatus({ botId: 'a', state: 'done', message: 'n', handoffTo: 'b' }, new Date('2026-10-29T10:05:00Z'));
  const rows = await store.listStatuses();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, 'done');
  assert.equal(rows[0].handoffTo, 'b');

  await store.putUsage({ percentLeft: 40, used: null, limit: null, resetsAt: null, readAt: '2026-10-29T09:00:00.000Z' });
  await store.putUsage({ percentLeft: 55, used: null, limit: null, resetsAt: null, readAt: '2026-10-29T08:00:00.000Z' });
  assert.equal((await store.latestUsage()).percentLeft, 40, 'latest by readAt, not by arrival');

  await store.recordHeartbeat({ ok: true, lastPushAt: null, detail: 'ok' }, new Date('2026-10-29T10:10:00Z'));
  const info = await store.feedInfo();
  assert.equal(info.lastPushAt, '2026-10-29T10:05:00.000Z');
  assert.equal(info.firstHeartbeatAt, '2026-10-29T10:10:00.000Z');

  const reopened = createFileStore({ file });
  assert.equal((await reopened.listStatuses()).length, 1);
  assert.ok(readFileSync(file, 'utf8').includes('"state": "done"'));
});

test('layout assigns every roster bot a desk and an idle seat from config/roster.json', () => {
  const roster = JSON.parse(readFileSync('config/roster.json', 'utf8'));
  const layout = buildLayout(roster.bots, roster.lead);
  for (const b of roster.bots) {
    const a = layout.assignments.get(b.id);
    assert.ok(a?.desk?.seat && a?.idle, `assignment for ${b.name}`);
    if (b.zone === 'Rooftop') {
      assert.equal(a.idle.floor, 'roof', `${b.name} idles on the rooftop`);
      assert.equal(a.desk.zone, 'Hot desks', `${b.name} works at a hot desk`);
    } else {
      assert.equal(a.idle.floor, 'office', `${b.name} idles in the office`);
    }
  }
  assert.equal(layout.assignments.get(roster.lead).desk, layout.lead.desk);
  const idleSeats = roster.bots.map((b) => layout.assignments.get(b.id).idle.id);
  assert.equal(new Set(idleSeats).size, idleSeats.length, 'no two bots share an idle seat');
});

test('routes connect every desk, idle seat and delivery spot, with an elevator ride between floors', () => {
  const roster = JSON.parse(readFileSync('config/roster.json', 'utf8'));
  const layout = buildLayout(roster.bots, roster.lead);
  const leadDeliver = layout.lead.desk.deliver;
  for (const b of roster.bots) {
    const a = layout.assignments.get(b.id);
    const there = route(a.idle, a.desk.seat);
    const walk = there.filter((s) => s.type === 'walk');
    assert.ok(walk.length >= 1);
    const last = walk[walk.length - 1].points.at(-1);
    assert.deepEqual(last, a.desk.seat.pos);
    assert.equal(there.some((s) => s.type === 'ride'), a.idle.floor !== a.desk.seat.floor);
    const handoff = route(a.desk.seat, leadDeliver);
    if (b.id !== roster.lead) assert.deepEqual(handoff.at(-1).points.at(-1), leadDeliver.pos);
  }
  assert.ok(ELEVATOR_SPOTS.office && ELEVATOR_SPOTS.roof);
});
