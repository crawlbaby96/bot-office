// Local stand-in for the provider APIs, used only by the e2e run. It serves the documented response shapes and checks
// that each request carries the expected auth header. The dev server points at it through the *_API_BASE env vars:
//   CURSOR_API_BASE=<url>/cursor  OPENAI_API_BASE=<url>/openai  ANTHROPIC_API_BASE=<url>/anthropic
// All numbers are made up.
import { createServer } from 'node:http';

export const MOCK_KEYS = {
  CURSOR_API_KEY: 'e2e-cursor-user-key',
  CURSOR_ADMIN_API_KEY: 'e2e-cursor-admin-key',
  OPENAI_ADMIN_KEY: 'e2e-openai-admin-key',
  ANTHROPIC_ADMIN_KEY: 'e2e-anthropic-admin-key',
};

const basic = (k) => `Basic ${Buffer.from(`${k}:`).toString('base64')}`;
const DAY = 86400;

export async function startMockProviders(port = 5299) {
  // agents: [{ id, name, status: ACTIVE|IDLE|ARCHIVED, createdAt, repo, run }]
  const state = { agents: [], fail: {} };

  const handle = (req, body) => {
    const u = new URL(req.url, 'http://mock');
    const [, provider, ...rest] = u.pathname.split('/');
    const path = `/${rest.join('/')}`;
    const auth = req.headers.authorization;

    if (provider === 'cursor' && path.startsWith('/v1/agents')) {
      if (state.fail.cursorAgents) return [state.fail.cursorAgents, { error: 'mock failure' }];
      if (auth !== basic(MOCK_KEYS.CURSOR_API_KEY) && auth !== `Bearer ${MOCK_KEYS.CURSOR_API_KEY}`) return [401, { error: 'Unauthorized' }];
      const parts = rest.slice(2);
      if (parts.length === 0) {
        const items = state.agents
          .slice()
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .map((a) => ({ id: a.id, name: a.name, status: a.status, env: { type: 'cloud' }, url: `https://cursor.com/agents/${a.id}`, createdAt: a.createdAt, updatedAt: a.createdAt, latestRunId: `run-${a.id}` }));
        return [200, { items }];
      }
      const a = state.agents.find((x) => x.id === decodeURIComponent(parts[0]));
      if (!a) return [404, { error: 'Not Found' }];
      if (parts.length === 1) {
        return [200, { id: a.id, name: a.name, status: a.status, env: { type: 'cloud' }, repos: a.repo ? [{ url: `https://github.com/example-org/${a.repo}`, startingRef: 'main' }] : [], workOnCurrentBranch: false, autoCreatePR: true, createdAt: a.createdAt, updatedAt: a.createdAt, latestRunId: `run-${a.id}` }];
      }
      return [200, {
        id: `run-${a.id}`, agentId: a.id, status: a.run, createdAt: a.createdAt, updatedAt: a.createdAt,
        result: 'MOCK-PRIVATE-RESULT-TEXT',
        git: { branches: [{ repoUrl: `github.com/example-org/${a.repo}`, branch: 'cursor/mock-private-branch', prUrl: 'https://github.com/example-org/x/pull/999' }] },
      }];
    }

    if (provider === 'cursor' && path === '/teams/spend' && req.method === 'POST') {
      if (state.fail.cursorAdmin) return [state.fail.cursorAdmin, { error: 'Forbidden', message: 'Enterprise access required' }];
      if (auth !== basic(MOCK_KEYS.CURSOR_ADMIN_API_KEY)) return [401, { error: 'Unauthorized' }];
      const { page = 1 } = JSON.parse(body || '{}');
      const start = new Date();
      start.setUTCDate(start.getUTCDate() - 9);
      start.setUTCHours(0, 0, 0, 0);
      return [200, {
        teamMemberSpend: page === 1
          ? [{ userId: 'user_mock1', spendCents: 1210.5, overallSpendCents: 4210.5, name: 'Mock One', email: 'one@example.com', role: 'owner' },
             { userId: 'user_mock2', spendCents: 0, overallSpendCents: 1890.25, name: 'Mock Two', email: 'two@example.com', role: 'member' }]
          : [],
        subscriptionCycleStart: start.getTime(),
        totalMembers: 2,
        totalPages: 1,
      }];
    }

    if (provider === 'openai' && path.startsWith('/v1/organization/')) {
      if (state.fail.openai) return [state.fail.openai, { error: { message: 'mock failure' } }];
      if (auth !== `Bearer ${MOCK_KEYS.OPENAI_ADMIN_KEY}`) return [401, { error: { message: 'Invalid key' } }];
      const start = Number(u.searchParams.get('start_time'));
      const days = Math.ceil((Date.now() / 1000 - start) / DAY);
      const data = Array.from({ length: days }, (_, i) => {
        const st = start + i * DAY;
        const results = path.endsWith('/costs')
          ? [{ object: 'organization.costs.result', amount: { value: 0.75 + (i % 4) * 0.5, currency: 'usd' }, line_item: null, project_id: null }]
          : [{ object: 'organization.usage.completions.result', input_tokens: 120000 + i * 1000, output_tokens: 30000 + i * 200, num_model_requests: 40 }];
        return { object: 'bucket', start_time: st, end_time: st + DAY, results };
      });
      return [200, { object: 'page', data, has_more: false, next_page: null }];
    }

    if (provider === 'anthropic' && path.startsWith('/v1/organizations/')) {
      if (state.fail.anthropic) return [state.fail.anthropic, { type: 'error', error: { type: 'api_error', message: 'mock failure' } }];
      if (req.headers['x-api-key'] !== MOCK_KEYS.ANTHROPIC_ADMIN_KEY || !req.headers['anthropic-version']) return [401, { type: 'error', error: { type: 'authentication_error' } }];
      const start = Date.parse(u.searchParams.get('starting_at'));
      const days = Math.ceil((Date.now() - start) / (DAY * 1000));
      const data = Array.from({ length: days }, (_, i) => {
        const st = new Date(start + i * DAY * 1000).toISOString().replace('.000Z', 'Z');
        const en = new Date(start + (i + 1) * DAY * 1000).toISOString().replace('.000Z', 'Z');
        const results = path.endsWith('/cost_report')
          ? [{ amount: String(85.5 + (i % 3) * 40), currency: 'USD', cost_type: null, description: null, model: null, workspace_id: null }]
          : [{ uncached_input_tokens: 50000, cache_read_input_tokens: 20000, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 1000 }, output_tokens: 9000, server_tool_use: { web_search_requests: 0 } }];
        return { starting_at: st, ending_at: en, results };
      });
      return [200, { data, has_more: false, next_page: null }];
    }

    return [404, { error: 'Not Found' }];
  };

  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const [status, json] = handle(req, body);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const url = `http://127.0.0.1:${port}`;
  return {
    url,
    env: { ...MOCK_KEYS, CURSOR_API_BASE: `${url}/cursor`, OPENAI_API_BASE: `${url}/openai`, ANTHROPIC_API_BASE: `${url}/anthropic` },
    setAgents(list) {
      state.agents = list;
    },
    /** fail: { cursorAgents?, cursorAdmin?, openai?, anthropic? } -> HTTP status to return instead of data. */
    setFail(fail) {
      state.fail = fail;
    },
    close: () => new Promise((r) => server.close(r)),
  };
}
