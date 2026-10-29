import { checkBearer } from '../lib/auth.js';
import { error, json, readJson, requireSession } from '../lib/http.js';
import { validateUsage } from '../lib/rules.js';
import { getStore } from '../lib/store/index.js';

export async function GET(request) {
  const denied = await requireSession(request);
  if (denied) return denied;
  const store = await getStore();
  return json({ usage: await store.latestUsage() });
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
  const result = validateUsage(body);
  if (!result.ok) return error(400, result.error);
  const store = await getStore();
  return json({ ok: true, usage: await store.putUsage(result.value) }, 201);
}
