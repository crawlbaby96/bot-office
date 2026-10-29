import { checkBearer } from '../lib/auth.js';
import { error, json, readJson, requireSession } from '../lib/http.js';
import { getRoster } from '../lib/roster.js';
import { effectiveStatus, validateStatus } from '../lib/rules.js';
import { getStore } from '../lib/store/index.js';

export async function GET(request) {
  const denied = await requireSession(request);
  if (denied) return denied;
  const store = await getStore();
  const now = Date.now();
  const statuses = (await store.listStatuses()).map((r) => effectiveStatus(r, now));
  return json({ serverTime: new Date(now).toISOString(), statuses });
}

export async function POST(request) {
  if (!process.env.OFFICE_PUSH_TOKEN) return error(503, 'OFFICE_PUSH_TOKEN is not configured');
  if (!(await checkBearer(request, process.env.OFFICE_PUSH_TOKEN))) return error(401, 'Invalid or missing bearer token');
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return error(e.status || 400, e.message);
  }
  const result = validateStatus(body, getRoster().ids);
  if (!result.ok) return error(400, result.error);
  const store = await getStore();
  const saved = await store.putStatus(result.value);
  return json({ ok: true, status: effectiveStatus(saved) }, 201);
}
