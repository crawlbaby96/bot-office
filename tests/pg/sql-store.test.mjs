// Runs the SQL store (the same code path Neon uses in production) against a real Postgres.
//   TEST_DATABASE_URL=postgres://office:office@localhost:5432/office_test npm run test:pg
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import postgres from 'postgres';
import { createSqlStore } from '../../lib/store/sql-store.js';

const url = process.env.TEST_DATABASE_URL;
const sql = url ? postgres(url, { onnotice: () => {} }) : null;

before(async () => {
  if (!sql) return;
  await sql.unsafe('DROP TABLE IF EXISTS bot_status, status_events, usage_readings, feed_heartbeats, schema_migrations');
  execFileSync(process.execPath, ['scripts/db-migrate.mjs'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
});

after(async () => sql?.end());

test('migration is idempotent and tables start empty', { skip: !sql && 'TEST_DATABASE_URL not set' }, async () => {
  const out = execFileSync(process.execPath, ['scripts/db-migrate.mjs'], { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' });
  assert.match(out, /skip\s+001_init\.sql/);
  for (const t of ['bot_status', 'status_events', 'usage_readings', 'feed_heartbeats']) {
    const [{ n }] = await sql.unsafe(`SELECT count(*)::int AS n FROM ${t}`);
    assert.equal(n, 0, `${t} has no seed rows`);
  }
});

test('sql store round-trips statuses, usage, heartbeats and prunes', { skip: !sql && 'TEST_DATABASE_URL not set' }, async () => {
  const store = createSqlStore(sql);
  await store.ping();
  assert.deepEqual(await store.listStatuses(), []);
  assert.equal(await store.latestUsage(), null);
  assert.deepEqual(await store.feedInfo(), { lastPushAt: null, lastHeartbeat: null, firstHeartbeatAt: null });

  const s1 = await store.putStatus({ botId: 'a', state: 'working', message: 'first', handoffTo: null }, new Date('2026-10-29T10:00:00Z'));
  assert.equal(s1.updatedAt, '2026-10-29T10:00:00.000Z');
  await store.putStatus({ botId: 'a', state: 'done', message: 'second', handoffTo: 'b' }, new Date('2026-10-29T10:05:00Z'));
  await store.putStatus({ botId: 'c', state: 'waiting', message: 'third', handoffTo: null }, new Date('2026-10-29T10:01:00Z'));
  const rows = (await store.listStatuses()).sort((x, y) => x.botId.localeCompare(y.botId));
  assert.deepEqual(rows.map((r) => [r.botId, r.state, r.handoffTo]), [['a', 'done', 'b'], ['c', 'waiting', null]]);
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM status_events`;
  assert.equal(n, 3);

  await assert.rejects(sql`INSERT INTO bot_status (bot_id, state, message) VALUES ('x', 'idle', ${'y'.repeat(81)})`, /check/i);

  await store.putUsage({ percentLeft: 62, used: null, limit: null, resetsAt: '2026-11-02T16:00:00.000Z', readAt: '2026-10-29T09:00:00.000Z' });
  await store.putUsage({ percentLeft: 70, used: 300, limit: 1000, resetsAt: null, readAt: '2026-10-29T07:00:00.000Z' });
  const u = await store.latestUsage();
  assert.deepEqual([u.percentLeft, u.resetsAt, u.readAt], [62, '2026-11-02T16:00:00.000Z', '2026-10-29T09:00:00.000Z']);

  await store.recordHeartbeat({ ok: true, lastPushAt: '2026-10-29T10:05:00.000Z', detail: 'ok' }, new Date('2026-10-29T10:10:00Z'));
  await store.recordHeartbeat({ ok: true, lastPushAt: '2026-10-29T10:05:00.000Z', detail: 'ok' }, new Date('2026-10-29T10:15:00Z'));
  const info = await store.feedInfo();
  assert.equal(info.lastPushAt, '2026-10-29T10:05:00.000Z');
  assert.equal(info.firstHeartbeatAt, '2026-10-29T10:10:00.000Z');
  assert.equal(info.lastHeartbeat.checkedAt, '2026-10-29T10:15:00.000Z');

  await store.prune(new Date('2027-06-01T00:00:00Z'));
  const [{ e }] = await sql`SELECT count(*)::int AS e FROM status_events`;
  const [{ h }] = await sql`SELECT count(*)::int AS h FROM feed_heartbeats`;
  const [{ r }] = await sql`SELECT count(*)::int AS r FROM usage_readings`;
  assert.deepEqual([e, h, r], [0, 0, 1], 'old history pruned; latest usage reading kept');
  assert.equal((await store.listStatuses()).length, 2, 'current statuses are never pruned');
});
