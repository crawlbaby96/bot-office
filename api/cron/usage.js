import { checkBearer } from '../../lib/auth.js';
import { error, json } from '../../lib/http.js';
import { refreshProviderUsage } from '../../lib/integrations/index.js';
import { getStore } from '../../lib/store/index.js';

// Vercel Cron calls this hourly with `Authorization: Bearer $CRON_SECRET`. The response lists outcomes only, no numbers.
export async function GET(request) {
  if (!process.env.CRON_SECRET) return error(503, 'CRON_SECRET is not configured');
  if (!(await checkBearer(request, process.env.CRON_SECRET))) return error(401, 'Unauthorized');

  let store;
  try {
    store = await getStore();
    await store.ping();
  } catch (err) {
    console.error('[office] usage cron: store unreachable', err);
    return json({ ok: false, detail: 'status store unreachable' }, 500);
  }
  const results = await refreshProviderUsage(store, process.env);
  return json({ ok: true, providers: results.map(({ provider, outcome }) => ({ provider, outcome })) });
}
