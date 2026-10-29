// Anthropic Usage and Cost Admin API (https://docs.anthropic.com/en/api/usage-cost-api), Admin API key
// (sk-ant-admin...) in x-api-key, with anthropic-version.
//   GET /v1/organizations/cost_report?starting_at=&bucket_width=1d&limit=&page=
//       -> { data: [{ starting_at, ending_at, results: [{ amount: "123.45" (cents, decimal string), currency }] }], has_more, next_page }
//   GET /v1/organizations/usage_report/messages?starting_at=&bucket_width=1d&limit=&page=
//       -> { data: [{ starting_at, results: [{ uncached_input_tokens, cache_read_input_tokens,
//            cache_creation: { ephemeral_1h_input_tokens, ephemeral_5m_input_tokens }, output_tokens }] }], has_more, next_page }
import { isoSeconds, pagedBuckets, centsToUsd, trimBase, windows } from './http.js';

export const ANTHROPIC_VERSION = '2023-06-01';

export async function fetchAnthropicUsage({ apiKey, baseUrl, fetch: fetchImpl = fetch, nowMs = Date.now() }) {
  const base = trimBase(baseUrl, 'https://api.anthropic.com');
  const headers = { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION };
  const w = windows(nowMs);

  const costs = await pagedBuckets(fetchImpl, `${base}/v1/organizations/cost_report?starting_at=${isoSeconds(w.start)}&bucket_width=1d&limit=31`, headers);
  let monthCents = 0;
  let weekCents = 0;
  for (const b of costs) {
    const startMs = Date.parse(b?.starting_at);
    if (!Number.isFinite(startMs) || !Array.isArray(b.results)) continue;
    let sum = 0;
    for (const r of b.results) {
      if (String(r?.currency ?? 'USD').toUpperCase() !== 'USD') continue;
      sum += Number.parseFloat(r?.amount) || 0;
    }
    if (startMs >= w.monthStart) monthCents += sum;
    if (startMs >= w.weekStart) weekCents += sum;
  }

  let tokens = null;
  try {
    const usage = await pagedBuckets(fetchImpl, `${base}/v1/organizations/usage_report/messages?starting_at=${isoSeconds(w.monthStart)}&bucket_width=1d&limit=31`, headers);
    tokens = { input: 0, output: 0 };
    for (const b of usage) {
      for (const r of Array.isArray(b?.results) ? b.results : []) {
        tokens.input += (Number(r?.uncached_input_tokens) || 0) + (Number(r?.cache_read_input_tokens) || 0)
          + (Number(r?.cache_creation?.ephemeral_1h_input_tokens) || 0) + (Number(r?.cache_creation?.ephemeral_5m_input_tokens) || 0);
        tokens.output += Number(r?.output_tokens) || 0;
      }
    }
  } catch {
    tokens = null;
  }

  return {
    monthStart: new Date(w.monthStart).toISOString(),
    weekStart: new Date(w.weekStart).toISOString(),
    monthUsd: centsToUsd(monthCents),
    weekUsd: centsToUsd(weekCents),
    tokens,
  };
}
