import { integrationsSnapshot, unavailableIntegrations } from './integrations/index.js';
import { publicRoster } from './roster.js';
import { computeFeedHealth, effectiveStatus, WAITING_STALE_MS, WORKING_STALE_MS } from './rules.js';
import { getStore } from './store/index.js';

export const POLL_SECONDS = 12;

export async function officeSnapshot(nowMs = Date.now()) {
  const roster = publicRoster();
  let statuses = {};
  let usage = null;
  let info = { lastPushAt: null, lastHeartbeat: null, firstHeartbeatAt: null };
  let integrations = null;
  let storeError = false;
  try {
    const store = await getStore();
    const [rows, latest, fi, ints] = await Promise.all([
      store.listStatuses(), store.latestUsage(), store.feedInfo(), integrationsSnapshot(store, process.env, nowMs),
    ]);
    const ids = new Set(roster.bots.map((b) => b.id));
    for (const row of rows) if (ids.has(row.botId)) statuses[row.botId] = effectiveStatus(row, nowMs);
    usage = latest;
    info = fi;
    integrations = ints;
  } catch (err) {
    console.error('[office] store read failed', err);
    storeError = true;
  }
  const feed = computeFeedHealth({
    nowMs,
    ...info,
    storeError,
    heartbeatStaleMinutes: process.env.HEARTBEAT_STALE_MINUTES,
  });
  return {
    serverTime: new Date(nowMs).toISOString(),
    lead: roster.lead,
    roster: roster.bots,
    statuses,
    usage,
    contractors: (integrations ?? unavailableIntegrations()).contractors,
    providers: (integrations ?? unavailableIntegrations()).providers,
    feed,
    config: {
      pollSeconds: POLL_SECONDS,
      workingStaleMinutes: WORKING_STALE_MS / 60000,
      waitingStaleHours: WAITING_STALE_MS / 3600000,
    },
  };
}
