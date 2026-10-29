// Cursor Admin API (https://cursor.com/docs/account/teams/admin-api), team admin key, Basic auth.
//   POST /teams/spend { page, pageSize } -> { teamMemberSpend: [{ spendCents, overallSpendCents, ... }],
//                                           subscriptionCycleStart (epoch ms), totalMembers, totalPages }
// Only team totals are kept; member names and emails are never stored.
import { badShape, basicAuth, requestJson, centsToUsd, trimBase } from './http.js';

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

export async function fetchCursorSpend({ apiKey, baseUrl, fetch: fetchImpl = fetch }) {
  const base = trimBase(baseUrl, 'https://api.cursor.com');
  const headers = { authorization: basicAuth(apiKey), 'content-type': 'application/json' };
  let totalCents = 0;
  let onDemandCents = 0;
  let cycleStart = null;
  let members = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await requestJson(fetchImpl, `${base}/teams/spend`, { method: 'POST', headers, body: { page, pageSize: PAGE_SIZE } });
    if (!body || !Array.isArray(body.teamMemberSpend)) throw badShape('team spend');
    for (const m of body.teamMemberSpend) {
      totalCents += Number(m?.overallSpendCents) || 0;
      onDemandCents += Number(m?.spendCents) || 0;
    }
    if (page === 1) {
      const start = Number(body.subscriptionCycleStart);
      cycleStart = Number.isFinite(start) && start > 0 ? new Date(start).toISOString() : null;
      members = Number.isFinite(Number(body.totalMembers)) ? Number(body.totalMembers) : null;
    }
    const totalPages = Number(body.totalPages) || 1;
    if (page >= totalPages || !body.teamMemberSpend.length) break;
  }
  return { cycleStart, members, cycleUsd: centsToUsd(totalCents), onDemandUsd: centsToUsd(onDemandCents) };
}
