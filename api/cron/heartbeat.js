import { checkBearer } from '../../lib/auth.js';
import { error, json } from '../../lib/http.js';
import { refreshCloudAgents } from '../../lib/integrations/index.js';
import { NO_PUSH_WARNING_MS } from '../../lib/rules.js';
import { getStore } from '../../lib/store/index.js';

// Vercel Cron calls this every 5 minutes with `Authorization: Bearer $CRON_SECRET`.
export async function GET(request) {
  if (!process.env.CRON_SECRET) return error(503, 'CRON_SECRET is not configured');
  if (!(await checkBearer(request, process.env.CRON_SECRET))) return error(401, 'Unauthorized');

  let store;
  try {
    store = await getStore();
    await store.ping();
  } catch (err) {
    console.error('[office] heartbeat: store unreachable', err);
    return json({ ok: false, detail: 'status store unreachable' }, 500);
  }

  const now = new Date();
  const { lastPushAt } = await store.feedInfo();
  let detail = 'ok';
  if (!lastPushAt) detail = 'no status pushes yet';
  else if (now - Date.parse(lastPushAt) >= NO_PUSH_WARNING_MS) {
    detail = `no status push for ${Math.floor((now - Date.parse(lastPushAt)) / 60000)} min`;
  }
  // `ok` records whether the feed pipeline (store) works; push silence is reported via `detail` and on read.
  const beat = await store.recordHeartbeat({ ok: true, lastPushAt, detail }, now);
  // Cloud agents ride on the same 5-minute cron. A provider failure is stored as its own snapshot, never as a feed failure.
  const cloudAgents = await refreshCloudAgents(store, process.env, { now }).catch((err) => {
    console.error('[office] cloud agents refresh failed', err);
    return { outcome: 'error' };
  });
  await store.prune(now).catch((err) => console.error('[office] prune failed', err));
  return json({ ok: true, heartbeat: beat, cloudAgents: { outcome: cloudAgents.outcome, running: cloudAgents.running ?? null } });
}
