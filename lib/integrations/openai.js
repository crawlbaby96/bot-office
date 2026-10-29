// OpenAI organization Usage and Costs API (https://platform.openai.com/docs/api-reference/usage), admin key, Bearer.
//   GET /v1/organization/costs?start_time=&bucket_width=1d&limit=&page=
//       -> { data: [{ start_time, end_time, results: [{ amount: { value, currency } }] }], has_more, next_page }
//   GET /v1/organization/usage/completions?start_time=&bucket_width=1d&limit=&page=
//       -> { data: [{ start_time, results: [{ input_tokens, output_tokens, ... }] }], has_more, next_page }
// Costs are in dollars. Windows are UTC days, matching the API's daily buckets.
import { pagedBuckets, round2, trimBase, windows } from './http.js';


export async function fetchOpenAIUsage({ apiKey, baseUrl, fetch: fetchImpl = fetch, nowMs = Date.now() }) {
  const base = trimBase(baseUrl, 'https://api.openai.com');
  const headers = { authorization: `Bearer ${apiKey}` };
  const w = windows(nowMs);
  const sec = (ms) => Math.floor(ms / 1000);

  const costs = await pagedBuckets(fetchImpl, `${base}/v1/organization/costs?start_time=${sec(w.start)}&bucket_width=1d&limit=31`, headers);
  let monthUsd = 0;
  let weekUsd = 0;
  for (const b of costs) {
    const startMs = Number(b?.start_time) * 1000;
    if (!Number.isFinite(startMs) || !Array.isArray(b.results)) continue;
    let sum = 0;
    for (const r of b.results) {
      if (String(r?.amount?.currency ?? 'usd').toLowerCase() !== 'usd') continue;
      sum += Number(r?.amount?.value) || 0;
    }
    if (startMs >= w.monthStart) monthUsd += sum;
    if (startMs >= w.weekStart) weekUsd += sum;
  }

  let tokens = null;
  try {
    const usage = await pagedBuckets(fetchImpl, `${base}/v1/organization/usage/completions?start_time=${sec(w.monthStart)}&bucket_width=1d&limit=31`, headers);
    tokens = { input: 0, output: 0 };
    for (const b of usage) {
      for (const r of Array.isArray(b?.results) ? b.results : []) {
        tokens.input += Number(r?.input_tokens) || 0;
        tokens.output += Number(r?.output_tokens) || 0;
      }
    }
  } catch {
    tokens = null;
  }

  return {
    monthStart: new Date(w.monthStart).toISOString(),
    weekStart: new Date(w.weekStart).toISOString(),
    monthUsd: round2(monthUsd),
    weekUsd: round2(weekUsd),
    tokens,
  };
}
