import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchAnthropicUsage } from '../../lib/integrations/anthropic.js';
import { fetchCloudAgents, MAX_CONTRACTORS, repoName, shortTitle } from '../../lib/integrations/cursor-agents.js';
import { fetchCursorSpend } from '../../lib/integrations/cursor-admin.js';
import { windows } from '../../lib/integrations/http.js';
import {
  contractorsView, integrationsSnapshot, PROVIDERS, providerView, refreshCloudAgents, refreshProviderUsage,
} from '../../lib/integrations/index.js';
import { fetchOpenAIUsage } from '../../lib/integrations/openai.js';
import { createFileStore } from '../../lib/store/file-store.js';
import * as fx from '../fixtures/providers.mjs';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const MIN = 60 * 1000;
const ago = (m) => new Date(NOW - m * MIN).toISOString();

function cursorAgentRoutes({ listStatus = 200 } = {}) {
  return {
    'GET /v1/agents': (u) => [listStatus, u.searchParams.get('cursor') ? fx.cursorAgentsPage2 : fx.cursorAgentsPage1],
    'GET /v1/agents/:id/runs/:run': (u) => {
      const [, , , agentId, , runId] = u.pathname.split('/');
      const status = agentId.endsWith('1') ? 'RUNNING' : 'WAITING_FOR_BACKGROUND_WORK';
      return [200, fx.cursorRun(runId, agentId, status)];
    },
    'GET /v1/agents/:id': (u) => {
      const id = u.pathname.split('/').pop();
      return [200, fx.cursorAgentDetail(id, id.endsWith('1') ? 'https://github.com/crawlbaby96/bot-office' : 'github.com/your-org/your-web-app.git')];
    },
  };
}

test('usage windows are the UTC calendar month and today plus the previous 6 UTC days', () => {
  const w = windows(NOW);
  assert.equal(new Date(w.monthStart).toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(new Date(w.weekStart).toISOString(), '2026-10-23T00:00:00.000Z');
  const early = windows(Date.parse('2026-11-02T08:00:00Z'));
  assert.equal(new Date(early.start).toISOString(), '2026-10-27T00:00:00.000Z', 'early in a month the 7-day window reaches back further');
});

test('cursor agents: lists ACTIVE agents across pages, looks up repo and run state, keeps only short safe fields', async () => {
  const f = fx.mockFetch(cursorAgentRoutes());
  const r = await fetchCloudAgents({ apiKey: 'test-user-key', fetch: f });
  assert.equal(r.running, 2);
  assert.equal(r.runningAtLeast, false);
  assert.deepEqual(r.agents.map((a) => [a.id.slice(-1), a.repo, a.state]), [['1', 'bot-office', 'running'], ['3', 'your-web-app', 'waiting']], 'longest-running first');
  assert.ok(r.agents[0].title.length <= 48 && r.agents[0].title.endsWith('…') && r.agents[0].title.startsWith('Refactor the billing export job'));
  assert.equal(r.agents[1].title, 'Add README with setup instructions');
  assert.equal(r.agents[0].startedAt, '2026-10-29T08:00:00.000Z');
  assert.deepEqual(Object.keys(r.agents[0]).sort(), ['id', 'repo', 'startedAt', 'state', 'title']);
  const text = JSON.stringify(r);
  for (const leak of ['SECRET', 'pull/123', 'secret-branch', 'cursor.com/agents']) assert.ok(!text.includes(leak), `does not keep ${leak}`);

  const list = f.calls.filter((c) => c.url.pathname === '/v1/agents');
  assert.equal(list.length, 2, 'follows nextCursor');
  assert.equal(list[0].url.origin, 'https://api.cursor.com');
  assert.equal(list[0].url.searchParams.get('includeArchived'), 'false');
  assert.equal(list[0].url.searchParams.get('limit'), '100');
  assert.equal(list[1].url.searchParams.get('cursor'), fx.cursorAgentsPage1.nextCursor);
  assert.equal(f.calls[0].headers.authorization, `Basic ${Buffer.from('test-user-key:').toString('base64')}`);
});

test('cursor agents: repos already known are not looked up again; overflow is counted but capped', async () => {
  const f = fx.mockFetch(cursorAgentRoutes());
  const known = new Map([['bc-00000000-0000-0000-0000-000000000001', { repo: 'bot-office' }], ['bc-00000000-0000-0000-0000-000000000003', { repo: 'web' }]]);
  await fetchCloudAgents({ apiKey: 'k', fetch: f, known });
  assert.equal(f.calls.filter((c) => /^\/v1\/agents\/[^/]+$/.test(c.url.pathname)).length, 0);

  const many = { items: Array.from({ length: 9 }, (_, i) => ({ id: `bc-${i}`, name: `Task ${i}`, status: 'ACTIVE', createdAt: `2026-10-29T0${i}:00:00.000Z` })) };
  const g = fx.mockFetch({ 'GET /v1/agents': () => [200, many], 'GET /v1/agents/:id': () => [200, { repos: [] }] });
  const r = await fetchCloudAgents({ apiKey: 'k', fetch: g });
  assert.equal(r.running, 9);
  assert.equal(r.agents.length, MAX_CONTRACTORS);
  assert.deepEqual(r.agents.map((a) => a.title), ['Task 0', 'Task 1', 'Task 2', 'Task 3', 'Task 4', 'Task 5']);
  assert.equal(r.agents[0].repo, null, 'no-repo agents have no repo name');
  assert.equal(r.agents[0].state, 'active', 'no run id: shown as active');
});

test('cursor agents: a refused key or a bad response throws a classified error', async () => {
  await assert.rejects(fetchCloudAgents({ apiKey: 'k', fetch: fx.mockFetch(cursorAgentRoutes({ listStatus: 401 })) }), (e) => e.kind === 'refused' && /401/.test(e.message) && !e.message.includes('k:'));
  await assert.rejects(fetchCloudAgents({ apiKey: 'k', fetch: fx.mockFetch({ 'GET /v1/agents': () => [200, { agents: [] }] }) }), (e) => e.kind === 'error');
  await assert.rejects(fetchCloudAgents({ apiKey: 'k', fetch: fx.mockFetch({ 'GET /v1/agents': () => [500, {}] }) }), (e) => e.kind === 'error' && /500/.test(e.message));
  await assert.rejects(fetchCloudAgents({ apiKey: 'k', fetch: async () => { throw new TypeError('fetch failed'); } }), (e) => e.kind === 'error' && /could not reach api\.cursor\.com/.test(e.message));
});

test('title and repo helpers', () => {
  assert.equal(shortTitle('  \n '), 'Untitled agent');
  assert.equal(repoName([{ url: 'https://github.com/org/repo-name' }, { url: 'https://github.com/org/other' }]), 'repo-name +1');
  assert.equal(repoName([{ url: 'https://evil/<script>' }]), null);
  assert.equal(repoName(undefined), null);
});

test('cursor admin: sums team spend across pages, keeps totals only', async () => {
  const f = fx.mockFetch({ 'POST /teams/spend': (u, init) => { const { page } = JSON.parse(init.body); return [200, fx.cursorSpendPage(page, 2)]; } });
  const m = await fetchCursorSpend({ apiKey: 'admin-key', fetch: f });
  assert.deepEqual(m, { cycleStart: '2026-10-03T00:00:00.000Z', members: 3, cycleUsd: 66.51, onDemandUsd: 43.26 });
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls.map((c) => c.body.page), [1, 2]);
  assert.equal(f.calls[0].url.href, 'https://api.cursor.com/teams/spend');
  assert.equal(f.calls[0].headers.authorization, `Basic ${Buffer.from('admin-key:').toString('base64')}`);
  assert.ok(!JSON.stringify(m).includes('company.com'));
  await assert.rejects(fetchCursorSpend({ apiKey: 'k', fetch: fx.mockFetch({ 'POST /teams/spend': () => [403, { error: 'Forbidden', message: 'Enterprise access required' }] }) }), (e) => e.kind === 'refused');
});

test('openai: this-month and last-7-days cost from daily buckets, completions tokens, pagination', async () => {
  const f = fx.mockFetch({
    'GET /v1/organization/costs': (u) => [200, u.searchParams.get('page') ? fx.openaiCostsPage2 : fx.openaiCostsPage1],
    'GET /v1/organization/usage/completions': () => [200, fx.openaiCompletions],
  });
  const m = await fetchOpenAIUsage({ apiKey: 'sk-admin-test', fetch: f, nowMs: NOW });
  assert.deepEqual(m, { monthStart: '2026-10-01T00:00:00.000Z', weekStart: '2026-10-23T00:00:00.000Z', monthUsd: 7, weekUsd: 3.25, tokens: { input: 3000, output: 750 } });
  const costCalls = f.calls.filter((c) => c.url.pathname.endsWith('/costs'));
  assert.equal(costCalls.length, 2);
  assert.equal(costCalls[0].url.searchParams.get('start_time'), String(Date.parse('2026-10-01T00:00:00Z') / 1000));
  assert.equal(costCalls[0].url.searchParams.get('bucket_width'), '1d');
  assert.equal(costCalls[1].url.searchParams.get('page'), fx.openaiCostsPage1.next_page);
  assert.equal(f.calls[0].headers.authorization, 'Bearer sk-admin-test');
});

test('openai: costs refused is an error; tokens failing alone still gives costs', async () => {
  await assert.rejects(fetchOpenAIUsage({ apiKey: 'k', nowMs: NOW, fetch: fx.mockFetch({ 'GET /v1/organization/costs': () => [401, {}] }) }), (e) => e.kind === 'refused');
  const m = await fetchOpenAIUsage({ apiKey: 'k', nowMs: NOW, fetch: fx.mockFetch({ 'GET /v1/organization/costs': () => [200, fx.openaiCostsPage2] }) });
  assert.equal(m.tokens, null);
  assert.equal(m.monthUsd, 3.25);
});

test('anthropic: cost report amounts are cents (decimal strings), messages usage tokens, admin headers', async () => {
  const f = fx.mockFetch({
    'GET /v1/organizations/cost_report': (u) => [200, u.searchParams.get('page') ? fx.anthropicCostPage2 : fx.anthropicCostPage1],
    'GET /v1/organizations/usage_report/messages': () => [200, fx.anthropicMessagesUsage],
  });
  const m = await fetchAnthropicUsage({ apiKey: 'sk-ant-admin01-test', fetch: f, nowMs: NOW });
  assert.deepEqual(m, { monthStart: '2026-10-01T00:00:00.000Z', weekStart: '2026-10-23T00:00:00.000Z', monthUsd: 4.5, weekUsd: 3.26, tokens: { input: 1730, output: 500 } });
  assert.equal(f.calls[0].url.origin, 'https://api.anthropic.com');
  assert.equal(f.calls[0].url.searchParams.get('starting_at'), '2026-10-01T00:00:00Z');
  assert.equal(f.calls[0].headers['x-api-key'], 'sk-ant-admin01-test');
  assert.equal(f.calls[0].headers['anthropic-version'], '2023-06-01');
  assert.equal(f.calls[1].url.searchParams.get('page'), fx.anthropicCostPage1.next_page);
  await assert.rejects(fetchAnthropicUsage({ apiKey: 'k', nowMs: NOW, fetch: fx.mockFetch({ 'GET /v1/organizations/cost_report': () => [403, {}] }) }), (e) => e.kind === 'refused');
});

test('provider view: not connected without a key, when refused, or when it never worked; stale after a failure or when old', () => {
  const p = PROVIDERS.find((x) => x.id === 'openai');
  const ok = (m) => ({ provider: 'openai', outcome: 'ok', detail: '', metrics: { monthUsd: 1 }, readAt: ago(m) });
  const bad = (m, outcome = 'error', detail = 'API error (500)') => ({ provider: 'openai', outcome, detail, metrics: null, readAt: ago(m) });

  const none = providerView({ provider: p, configured: false, lastAttempt: ok(1), lastOk: ok(1), nowMs: NOW });
  assert.equal(none.status, 'not_connected');
  assert.equal(none.detail, 'OPENAI_ADMIN_KEY is not set');
  assert.equal(none.metrics, null, 'no numbers when not connected, even if old readings exist');

  assert.equal(providerView({ provider: p, configured: true, nowMs: NOW }).status, 'pending');

  const fresh = providerView({ provider: p, configured: true, lastAttempt: ok(10), lastOk: ok(10), nowMs: NOW });
  assert.deepEqual([fresh.status, fresh.readAt, fresh.metrics.monthUsd], ['ok', ago(10), 1]);

  const refused = providerView({ provider: p, configured: true, lastAttempt: bad(5, 'refused', 'API refused the key (403)'), lastOk: ok(70), nowMs: NOW });
  assert.deepEqual([refused.status, refused.detail, refused.metrics], ['not_connected', 'API refused the key (403)', null]);

  const never = providerView({ provider: p, configured: true, lastAttempt: bad(5), nowMs: NOW });
  assert.deepEqual([never.status, never.metrics], ['not_connected', null]);
  assert.match(never.detail, /Last fetch failed/);

  const stale = providerView({ provider: p, configured: true, lastAttempt: bad(5), lastOk: ok(65), nowMs: NOW });
  assert.deepEqual([stale.status, stale.staleSince, stale.metrics.monthUsd], ['stale', ago(65), 1]);

  const old = providerView({ provider: p, configured: true, lastAttempt: ok(181), lastOk: ok(181), nowMs: NOW });
  assert.deepEqual([old.status, old.staleSince], ['stale', ago(181)]);
});

test('contractors view: only a fresh successful snapshot puts contractors in the office', () => {
  const snap = (m, outcome = 'ok', agents = [{ id: 'a', title: 'T', repo: 'r', state: 'running', startedAt: ago(30) }]) => ({ checkedAt: ago(m), outcome, detail: outcome === 'ok' ? '' : 'API error (502)', running: outcome === 'ok' ? agents.length : null, runningAtLeast: false, agents: outcome === 'ok' ? agents : [] });

  const off = contractorsView({ configured: false, lastAttempt: snap(1), lastOk: snap(1), nowMs: NOW });
  assert.deepEqual([off.status, off.agents.length, off.detail], ['not_connected', 0, 'CURSOR_API_KEY is not set']);
  assert.equal(contractorsView({ configured: true, nowMs: NOW }).status, 'pending');

  const ok = contractorsView({ configured: true, lastAttempt: snap(2), lastOk: snap(2), nowMs: NOW });
  assert.deepEqual([ok.status, ok.running, ok.agents.length, ok.asOf, ok.lastFetchFailed], ['ok', 1, 1, ago(2), null]);

  const blip = contractorsView({ configured: true, lastAttempt: snap(1, 'error'), lastOk: snap(6), nowMs: NOW });
  assert.deepEqual([blip.status, blip.agents.length, blip.lastFetchFailed], ['ok', 1, 'API error (502)'], 'a recent good snapshot is still shown, flagged');

  const stale = contractorsView({ configured: true, lastAttempt: snap(1, 'error'), lastOk: snap(16), nowMs: NOW });
  assert.deepEqual([stale.status, stale.agents.length, stale.staleSince], ['stale', 0, ago(16)]);

  const refused = contractorsView({ configured: true, lastAttempt: snap(1, 'refused'), lastOk: snap(6), nowMs: NOW });
  assert.deepEqual([refused.status, refused.agents.length], ['not_connected', 0]);

  const many = contractorsView({ configured: true, lastAttempt: snap(1), lastOk: { ...snap(1), running: 9, agents: Array.from({ length: 9 }, (_, i) => ({ id: String(i) })) }, nowMs: NOW });
  assert.deepEqual([many.running, many.agents.length], [9, MAX_CONTRACTORS]);
});

test('refresh jobs store snapshots and readings; missing keys are skipped and shown as not connected', async () => {
  const store = createFileStore();
  const now = new Date(NOW);
  assert.deepEqual(await refreshCloudAgents(store, {}, { now }), { outcome: 'not_configured' });
  assert.equal((await store.cloudAgentSnapshots()).lastAttempt, null, 'nothing stored without a key');

  const env = { CURSOR_API_KEY: 'k', OPENAI_ADMIN_KEY: 'k2' };
  const agentsOk = fx.mockFetch(cursorAgentRoutes());
  assert.deepEqual(await refreshCloudAgents(store, env, { fetch: agentsOk, now }), { outcome: 'ok', running: 2 });
  const failing = fx.mockFetch({ 'GET /v1/agents': () => [502, {}] });
  const r2 = await refreshCloudAgents(store, env, { fetch: failing, now: new Date(NOW + MIN) });
  assert.equal(r2.outcome, 'error');
  const snaps = await store.cloudAgentSnapshots();
  assert.equal(snaps.lastAttempt.outcome, 'error');
  assert.equal(snaps.lastOk.agents.length, 2);

  const usageFetch = fx.mockFetch({
    'GET /v1/organization/costs': () => [200, fx.openaiCostsPage2],
    'GET /v1/organization/usage/completions': () => [200, fx.openaiCompletions],
  });
  const results = await refreshProviderUsage(store, env, { fetch: usageFetch, now });
  assert.deepEqual(results.map((r) => [r.provider, r.outcome]), [['cursor', 'not_configured'], ['openai', 'ok'], ['anthropic', 'not_configured']]);

  const snap = await integrationsSnapshot(store, env, NOW + 2 * MIN);
  assert.equal(snap.contractors.status, 'ok');
  assert.equal(snap.contractors.agents.length, 2);
  assert.equal(snap.contractors.lastFetchFailed, 'API error (502)');
  const byId = Object.fromEntries(snap.providers.map((p) => [p.id, p]));
  assert.deepEqual([byId.cursor.status, byId.cursor.detail], ['not_connected', 'CURSOR_ADMIN_API_KEY is not set']);
  assert.deepEqual([byId.openai.status, byId.openai.metrics.weekUsd, byId.openai.readAt], ['ok', 3.25, now.toISOString()]);
  assert.equal(byId.anthropic.status, 'not_connected');
  assert.ok(!JSON.stringify(snap).includes('SECRET'));
});
