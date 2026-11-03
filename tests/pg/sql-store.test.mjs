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
  await sql.unsafe('DROP TABLE IF EXISTS trade_offers, trade_messages, trade_participants, trade_room_keys, trade_rooms, bot_status, status_events, usage_readings, feed_heartbeats, cloud_agent_snapshots, provider_usage_readings, schema_migrations');
  execFileSync(process.execPath, ['scripts/db-migrate.mjs'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
});

after(async () => sql?.end());

test('migration is idempotent and tables start empty', { skip: !sql && 'TEST_DATABASE_URL not set' }, async () => {
  const out = execFileSync(process.execPath, ['scripts/db-migrate.mjs'], { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' });
  assert.match(out, /skip\s+001_init\.sql/);
  assert.match(out, /skip\s+002_cloud_agents\.sql/);
  assert.match(out, /skip\s+003_provider_usage\.sql/);
  assert.match(out, /apply\s+004_trade_room\.sql|skip\s+004_trade_room\.sql/);
  assert.match(out, /apply\s+005_trade_public_rooms\.sql|skip\s+005_trade_public_rooms\.sql/);
  for (const t of ['bot_status', 'status_events', 'usage_readings', 'feed_heartbeats', 'cloud_agent_snapshots', 'provider_usage_readings', 'trade_rooms']) {
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

test('migrations re-apply cleanly even without the schema_migrations bookkeeping', { skip: !sql && 'TEST_DATABASE_URL not set' }, async () => {
  await sql`DELETE FROM schema_migrations`;
  const out = execFileSync(process.execPath, ['scripts/db-migrate.mjs'], { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' });
  assert.match(out, /apply\s+002_cloud_agents\.sql/);
  assert.match(out, /apply\s+003_provider_usage\.sql/);
});

test('sql store round-trips cloud agent snapshots and provider readings, and prunes them', { skip: !sql && 'TEST_DATABASE_URL not set' }, async () => {
  const store = createSqlStore(sql);
  assert.deepEqual(await store.cloudAgentSnapshots(), { lastAttempt: null, lastOk: null });
  assert.deepEqual(await store.providerReadings(), {});

  const agents = [{ id: 'bc-1', title: 'Fix a test', repo: 'bot-office', state: 'running', startedAt: '2026-10-29T08:00:00.000Z' }];
  await store.putCloudAgentSnapshot({ outcome: 'ok', detail: '', running: 3, runningAtLeast: false, agents }, new Date('2026-10-29T10:00:00Z'));
  await store.putCloudAgentSnapshot({ outcome: 'error', detail: 'API error (502)', running: null, runningAtLeast: false, agents: [] }, new Date('2026-10-29T10:05:00Z'));
  const snaps = await store.cloudAgentSnapshots();
  assert.deepEqual([snaps.lastAttempt.outcome, snaps.lastAttempt.checkedAt, snaps.lastAttempt.running], ['error', '2026-10-29T10:05:00.000Z', null]);
  assert.deepEqual([snaps.lastOk.running, snaps.lastOk.agents], [3, agents]);

  const m = { monthUsd: 7, weekUsd: 3.25, tokens: { input: 3000, output: 750 } };
  await store.putProviderReading({ provider: 'openai', outcome: 'ok', detail: '', metrics: m, readAt: '2026-10-29T09:00:00.000Z' });
  await store.putProviderReading({ provider: 'openai', outcome: 'error', detail: 'API error (500)', metrics: null, readAt: '2026-10-29T10:00:00.000Z' });
  await store.putProviderReading({ provider: 'cursor', outcome: 'refused', detail: 'API refused the key (403)', metrics: null, readAt: '2026-10-29T10:00:00.000Z' });
  const r = await store.providerReadings();
  assert.deepEqual([r.openai.lastAttempt.outcome, r.openai.lastOk.metrics, r.openai.lastOk.readAt], ['error', m, '2026-10-29T09:00:00.000Z']);
  assert.deepEqual([r.cursor.lastAttempt.outcome, r.cursor.lastOk], ['refused', null]);

  await assert.rejects(sql`INSERT INTO provider_usage_readings (provider, outcome, read_at) VALUES ('openai', 'ok', now())`, /check/i);
  await assert.rejects(sql`INSERT INTO provider_usage_readings (provider, outcome, read_at) VALUES ('grok', 'error', now())`, /check/i);

  await store.prune(new Date('2027-06-01T00:00:00Z'));
  const [{ a }] = await sql`SELECT count(*)::int AS a FROM cloud_agent_snapshots`;
  const [{ p }] = await sql`SELECT count(*)::int AS p FROM provider_usage_readings`;
  assert.deepEqual([a, p], [1, 1], 'old history pruned; latest good snapshot and latest good reading per provider kept');
  assert.equal((await store.cloudAgentSnapshots()).lastOk.running, 3);
});
