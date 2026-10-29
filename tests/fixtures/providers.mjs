// Provider responses in the shapes documented by each provider (field names and nesting copied from the public API
// reference examples). All values are made up for tests; none are real usage numbers.

export const cursorAgentsPage1 = {
  items: [
    {
      id: 'bc-00000000-0000-0000-0000-000000000003',
      name: 'Add README with setup instructions',
      status: 'ACTIVE',
      env: { type: 'cloud' },
      url: 'https://cursor.com/agents/bc-00000000-0000-0000-0000-000000000003',
      createdAt: '2026-10-29T10:30:00.000Z',
      updatedAt: '2026-10-29T10:45:00.000Z',
      latestRunId: 'run-00000000-0000-0000-0000-000000000003',
    },
    {
      id: 'bc-00000000-0000-0000-0000-000000000002',
      name: 'Fix flaky login test',
      status: 'IDLE',
      env: { type: 'cloud' },
      url: 'https://cursor.com/agents/bc-00000000-0000-0000-0000-000000000002',
      createdAt: '2026-10-29T09:00:00.000Z',
      updatedAt: '2026-10-29T09:20:00.000Z',
      latestRunId: 'run-00000000-0000-0000-0000-000000000002',
    },
  ],
  nextCursor: 'bc-00000000-0000-0000-0000-000000000002',
};

export const cursorAgentsPage2 = {
  items: [
    {
      id: 'bc-00000000-0000-0000-0000-000000000001',
      name: '  Refactor   the billing\nexport job so it streams rows instead of loading everything into memory  ',
      status: 'ACTIVE',
      env: { type: 'cloud' },
      url: 'https://cursor.com/agents/bc-00000000-0000-0000-0000-000000000001',
      createdAt: '2026-10-29T08:00:00.000Z',
      updatedAt: '2026-10-29T10:50:00.000Z',
      latestRunId: 'run-00000000-0000-0000-0000-000000000001',
    },
    {
      id: 'bc-00000000-0000-0000-0000-000000000000',
      name: 'Old archived agent',
      status: 'ARCHIVED',
      env: { type: 'cloud' },
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-02T08:00:00.000Z',
      latestRunId: 'run-00000000-0000-0000-0000-000000000000',
    },
  ],
};

export const cursorAgentDetail = (id, url) => ({
  id,
  name: 'ignored',
  status: 'ACTIVE',
  env: { type: 'cloud' },
  repos: [{ url, startingRef: 'main' }],
  workOnCurrentBranch: false,
  autoCreatePR: true,
  url: `https://cursor.com/agents/${id}`,
  createdAt: '2026-10-29T08:00:00.000Z',
  updatedAt: '2026-10-29T08:00:00.000Z',
  latestRunId: 'run-x',
});

export const cursorRun = (id, agentId, status) => ({
  id,
  agentId,
  status,
  createdAt: '2026-10-29T10:30:00.000Z',
  updatedAt: '2026-10-29T10:45:00.000Z',
  result: 'SECRET-RESULT-TEXT should never be stored',
  git: { branches: [{ repoUrl: 'github.com/your-org/your-repo', branch: 'cursor/secret-branch-a1b2', prUrl: 'https://github.com/your-org/your-repo/pull/123' }] },
});

export const cursorSpendPage = (page, totalPages) => ({
  teamMemberSpend: page === 1
    ? [
        { userId: 'user_A', spendCents: 2450.125487, overallSpendCents: 2450.125487, fastPremiumRequests: 1250, name: 'Alex', email: 'developer@company.com', role: 'member', hardLimitOverrideDollars: 100, monthlyLimitDollars: 200, effectivePerUserLimitDollars: 100 },
        { userId: 'user_B', spendCents: 1875.500123, overallSpendCents: 3200.750456, fastPremiumRequests: 980, name: 'Sam', email: 'admin@company.com', role: 'owner', hardLimitOverrideDollars: 0, monthlyLimitDollars: null, effectivePerUserLimitDollars: 50 },
      ]
    : [{ userId: 'user_C', spendCents: 0, overallSpendCents: 1000, fastPremiumRequests: 0, name: 'Kim', email: 'kim@company.com', role: 'member', hardLimitOverrideDollars: 0, monthlyLimitDollars: null, effectivePerUserLimitDollars: 50 }],
  subscriptionCycleStart: Date.UTC(2026, 9, 3),
  totalMembers: 3,
  totalPages,
});

const day = (iso) => Math.floor(Date.parse(iso) / 1000);

export const openaiCostsPage1 = {
  object: 'page',
  data: [
    { object: 'bucket', start_time: day('2026-09-30T00:00:00Z'), end_time: day('2026-10-01T00:00:00Z'), results: [{ object: 'organization.costs.result', amount: { value: 99, currency: 'usd' }, line_item: null, project_id: null, api_key_id: null, quantity: null, quantity_unit: null }] },
    { object: 'bucket', start_time: day('2026-10-01T00:00:00Z'), end_time: day('2026-10-02T00:00:00Z'), results: [{ object: 'organization.costs.result', amount: { value: 1.5, currency: 'usd' }, line_item: null, project_id: null }] },
    { object: 'bucket', start_time: day('2026-10-22T00:00:00Z'), end_time: day('2026-10-23T00:00:00Z'), results: [{ object: 'organization.costs.result', amount: { value: 2.25, currency: 'usd' }, line_item: null, project_id: null }] },
  ],
  has_more: true,
  next_page: 'page_AAAAAGdGxdEiJdKOAAAAAGcqsYA=',
};

export const openaiCostsPage2 = {
  object: 'page',
  data: [
    { object: 'bucket', start_time: day('2026-10-23T00:00:00Z'), end_time: day('2026-10-24T00:00:00Z'), results: [{ object: 'organization.costs.result', amount: { value: 0.06, currency: 'usd' }, line_item: null, project_id: null }] },
    { object: 'bucket', start_time: day('2026-10-29T00:00:00Z'), end_time: day('2026-10-30T00:00:00Z'), results: [{ object: 'organization.costs.result', amount: { value: 3, currency: 'usd' }, line_item: null, project_id: null }, { object: 'organization.costs.result', amount: { value: 0.19, currency: 'usd' }, line_item: null, project_id: null }] },
  ],
  has_more: false,
  next_page: null,
};

export const openaiCompletions = {
  object: 'page',
  data: [
    {
      object: 'bucket',
      start_time: day('2026-10-01T00:00:00Z'),
      end_time: day('2026-10-02T00:00:00Z'),
      results: [{ object: 'organization.usage.completions.result', input_tokens: 1000, input_cached_tokens: 400, input_uncached_tokens: 500, output_tokens: 500, num_model_requests: 5, project_id: null, user_id: null, api_key_id: null, model: null, batch: null, service_tier: null }],
    },
    {
      object: 'bucket',
      start_time: day('2026-10-29T00:00:00Z'),
      end_time: day('2026-10-30T00:00:00Z'),
      results: [{ object: 'organization.usage.completions.result', input_tokens: 2000, output_tokens: 250, num_model_requests: 3 }],
    },
  ],
  has_more: false,
  next_page: null,
};

export const anthropicCostPage1 = {
  data: [
    { starting_at: '2026-09-30T00:00:00Z', ending_at: '2026-10-01T00:00:00Z', results: [{ amount: '5000', currency: 'USD', cost_type: null, description: null, model: null, workspace_id: null }] },
    { starting_at: '2026-10-01T00:00:00Z', ending_at: '2026-10-02T00:00:00Z', results: [{ amount: '123.78912', currency: 'USD' }] },
    { starting_at: '2026-10-22T00:00:00Z', ending_at: '2026-10-23T00:00:00Z', results: [] },
  ],
  has_more: true,
  next_page: 'page_MjAyNS0wNS0xNFQwMDowMDowMFo=',
};

export const anthropicCostPage2 = {
  data: [
    { starting_at: '2026-10-23T00:00:00Z', ending_at: '2026-10-24T00:00:00Z', results: [{ amount: '250', currency: 'USD' }] },
    { starting_at: '2026-10-29T00:00:00Z', ending_at: '2026-10-30T00:00:00Z', results: [{ amount: '76.21088', currency: 'USD' }] },
  ],
  has_more: false,
  next_page: null,
};

export const anthropicMessagesUsage = {
  data: [
    {
      starting_at: '2026-10-01T00:00:00Z',
      ending_at: '2026-10-02T00:00:00Z',
      results: [{
        account_id: null,
        api_key_id: null,
        cache_creation: { ephemeral_1h_input_tokens: 10, ephemeral_5m_input_tokens: 20 },
        cache_read_input_tokens: 200,
        context_window: null,
        model: null,
        output_tokens: 500,
        server_tool_use: { web_search_requests: 10 },
        service_tier: null,
        uncached_input_tokens: 1500,
        workspace_id: null,
      }],
    },
  ],
  has_more: false,
  next_page: null,
};

/**
 * A fetch stand-in that routes by method + path and records every call (url, method, headers, body).
 * `routes` maps "GET /v1/agents" style keys to (url, init) => [status, body].
 */
export function mockFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    calls.push({ url: u, method, headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : null });
    const key = Object.keys(routes).find((k) => {
      const [m, pattern] = k.split(' ');
      return m === method && new RegExp(`^${pattern.replace(/:[a-z]+/gi, '[^/]+')}$`).test(u.pathname);
    });
    if (!key) return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
    const [status, body] = routes[key](u, init);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  fn.calls = calls;
  return fn;
}
