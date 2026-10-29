// Cursor Cloud Agents API (https://cursor.com/docs/cloud-agent/api/endpoints), authenticated with a user API key
// (Basic auth, key as username).
//   GET /v1/agents?limit=&cursor=&includeArchived=false  -> { items: [{ id, name, status, createdAt, latestRunId }], nextCursor? }
//   GET /v1/agents/{id}                                    -> { ..., repos: [{ url, startingRef }] }
//   GET /v1/agents/{id}/runs/{runId}                       -> { status: CREATING | RUNNING | WAITING_FOR_BACKGROUND_WORK | ... }
// An agent with status ACTIVE is "running" (a turn is running, waiting on background work, or about to start).
// IDLE and ARCHIVED agents are finished or expired and leave the office.
import { normalizeMessage } from '../rules.js';
import { badShape, basicAuth, requestJson, trimBase } from './http.js';

export const MAX_CONTRACTORS = 6;
export const MAX_TITLE_LENGTH = 48;
const PAGE_SIZE = 100;
const MAX_LIST_PAGES = 5;

const RUN_STATES = { CREATING: 'starting', RUNNING: 'running', WAITING_FOR_BACKGROUND_WORK: 'waiting' };

export function shortTitle(name) {
  const t = normalizeMessage(name);
  if (!t) return 'Untitled agent';
  return t.length > MAX_TITLE_LENGTH ? `${t.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : t;
}

/** Repo name only (last path segment), from e.g. "https://github.com/org/repo" or "github.com/org/repo.git". */
export function repoName(repos) {
  if (!Array.isArray(repos) || !repos.length) return null;
  const raw = String(repos[0]?.url ?? repos[0]?.repository ?? '');
  const seg = raw.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop()?.replace(/\.git$/i, '') ?? '';
  if (!/^[\w.-]{1,60}$/.test(seg)) return null;
  return repos.length > 1 ? `${seg} +${repos.length - 1}` : seg;
}

const isoOrNull = (v) => {
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

/**
 * Returns { running, runningAtLeast, agents: [{ id, title, repo, state, startedAt }] }.
 * At most MAX_CONTRACTORS agents get detail lookups (longest-running first, so the people at desks stay put);
 * `running` counts every ACTIVE agent so the office can show the overflow.
 * `known` maps agent id -> previously stored agent, so the repo lookup is skipped for agents already seen.
 */
export async function fetchCloudAgents({ apiKey, baseUrl, fetch: fetchImpl = fetch, known = new Map() }) {
  const base = trimBase(baseUrl, 'https://api.cursor.com');
  const headers = { authorization: basicAuth(apiKey) };
  const active = [];
  let cursor = null;
  let pages = 0;
  do {
    const q = new URLSearchParams({ limit: String(PAGE_SIZE), includeArchived: 'false' });
    if (cursor) q.set('cursor', cursor);
    const page = await requestJson(fetchImpl, `${base}/v1/agents?${q}`, { headers });
    if (!page || !Array.isArray(page.items)) throw badShape('agents list');
    for (const a of page.items) if (a && typeof a.id === 'string' && a.status === 'ACTIVE') active.push(a);
    cursor = typeof page.nextCursor === 'string' && page.nextCursor ? page.nextCursor : null;
    pages++;
  } while (cursor && pages < MAX_LIST_PAGES);

  active.sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0) || a.id.localeCompare(b.id));
  const agents = [];
  for (const a of active.slice(0, MAX_CONTRACTORS)) {
    const id = encodeURIComponent(a.id);
    let repo = known.get(a.id)?.repo ?? null;
    if (!repo) {
      try {
        repo = repoName((await requestJson(fetchImpl, `${base}/v1/agents/${id}`, { headers }))?.repos);
      } catch (err) {
        if (err.kind === 'refused' && err.status !== 404) throw err;
      }
    }
    let state = 'active';
    if (typeof a.latestRunId === 'string' && a.latestRunId) {
      try {
        const run = await requestJson(fetchImpl, `${base}/v1/agents/${id}/runs/${encodeURIComponent(a.latestRunId)}`, { headers });
        state = RUN_STATES[run?.status] ?? 'active';
      } catch (err) {
        if (err.kind === 'refused' && err.status !== 404) throw err;
      }
    }
    agents.push({ id: a.id, title: shortTitle(a.name), repo, state, startedAt: isoOrNull(a.createdAt) });
  }
  return { running: active.length, runningAtLeast: cursor != null, agents };
}
