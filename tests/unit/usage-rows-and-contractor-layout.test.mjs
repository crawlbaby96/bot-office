import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MAX_CONTRACTORS } from '../../lib/integrations/cursor-agents.js';
import { buildLayout, CONTRACTOR_DESK_XS, DEPARTMENTS, ELEVATOR_SPOTS, ROWS } from '../../src/scene/layout.js';
import { route } from '../../src/scene/nav.js';
import { usageRows } from '../../src/usageRows.js';

const provider = (id, status, extra = {}) => ({ id, label: id, sub: 'sub', status, detail: '', readAt: null, staleSince: null, metrics: null, ...extra });

test('usage rows: Grok Bot row first and unchanged; providers never show numbers unless a reading exists', () => {
  const rows = usageRows({
    usage: null,
    providers: [
      provider('cursor', 'not_connected', { detail: 'CURSOR_ADMIN_API_KEY is not set' }),
      provider('openai', 'ok', { readAt: '2026-10-29T11:07:00Z', metrics: { monthUsd: 42.75, weekUsd: 10.75, tokens: { input: 3900000, output: 951200 } } }),
      provider('anthropic', 'stale', { detail: 'Last fetch failed: API error (500)', readAt: '2026-10-29T09:07:00Z', staleSince: '2026-10-29T09:07:00Z', metrics: { monthUsd: 36, weekUsd: 8.79, tokens: null } }),
    ],
  });
  assert.deepEqual(rows.map((r) => r.id), ['grok', 'cursor', 'openai', 'anthropic']);
  assert.deepEqual([rows[0].primary, rows[0].status], ['No reading yet', 'pending']);
  assert.deepEqual([rows[1].primary, rows[1].secondary, rows[1].asOf], ['Not connected', 'CURSOR_ADMIN_API_KEY is not set', '']);
  assert.ok(!JSON.stringify(rows[1]).includes('$'));
  assert.equal(rows[2].primary, '$42.75 this month · $10.75 last 7 days');
  assert.equal(rows[2].secondary, '3.9M input · 951.2K output tokens this month');
  assert.match(rows[2].asOf, /^As of /);
  assert.match(rows[3].asOf, /^Stale since .*Last fetch failed: API error \(500\)$/);
  assert.equal(rows[3].secondary, 'Token counts unavailable');

  const pending = usageRows({ usage: { percentLeft: 62, resetsAt: null, readAt: '2026-10-29T11:00:00Z' }, providers: [provider('cursor', 'pending')] });
  assert.equal(pending[0].primary, '62% left');
  assert.deepEqual([pending[1].primary, pending[1].asOf], ['No reading yet', '']);

  const cursor = usageRows({ providers: [provider('cursor', 'ok', { readAt: '2026-10-29T11:07:00Z', metrics: { cycleUsd: 61.01, onDemandUsd: 12.11, cycleStart: '2026-10-20T00:00:00Z', members: 2 } })] })[1];
  assert.equal(cursor.primary, '$61.01 this billing cycle');
  assert.match(cursor.secondary, /^\$12\.11 on-demand · cycle since .+ · 2 members$/);
});

test('contractor hot desks: one per visible contractor, inside Engineering, reachable from the elevator', () => {
  const roster = JSON.parse(readFileSync('config/roster.json', 'utf8'));
  const layout = buildLayout(roster.bots, roster.lead);
  const eng = DEPARTMENTS.find((d) => d.name === 'Engineering');
  assert.equal(layout.contractors.length, MAX_CONTRACTORS);
  const engDesks = layout.departments.find((d) => d.name === 'Engineering').desks;
  for (const d of layout.contractors) {
    assert.ok(d.x > eng.x0 && d.x < eng.x1 && d.z > ROWS.A.z0 && d.z < ROWS.A.z1, `desk at ${d.x},${d.z} is in Engineering`);
    for (const e of engDesks) assert.ok(Math.abs(e.x - d.x) > 2.5 || Math.abs(e.z - d.z) > 1.5, 'does not overlap a bot desk');
    const there = route(ELEVATOR_SPOTS.office, d.seat);
    assert.deepEqual(there.at(-1).points.at(-1), d.seat.pos);
    const back = route(d.seat, ELEVATOR_SPOTS.office);
    assert.deepEqual(back.at(-1).points.at(-1), ELEVATOR_SPOTS.office.pos);
  }
  assert.equal(new Set(layout.contractors.map((d) => d.seat.id)).size, MAX_CONTRACTORS);
  assert.equal(CONTRACTOR_DESK_XS.length, 2);
});
