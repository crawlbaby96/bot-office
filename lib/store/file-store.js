import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

const empty = () => ({ statuses: {}, events: [], usage: [], heartbeats: [], cloudAgents: [], providerReadings: [] });
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/**
 * Local-dev store used when DATABASE_URL is unset. Starts empty (no seed data).
 * With a `file` path it persists to JSON so state survives dev-server restarts; without one it is memory-only.
 */
export function createFileStore({ file = null } = {}) {
  let data = empty();
  if (file) {
    try {
      data = { ...empty(), ...JSON.parse(readFileSync(file, 'utf8')) };
    } catch {
      data = empty();
    }
  }

  const reload = () => {
    if (!file) return;
    try {
      data = { ...empty(), ...JSON.parse(readFileSync(file, 'utf8')) };
    } catch {
      /* keep in-memory copy */
    }
  };

  const save = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, file);
  };

  return {
    kind: file ? 'file' : 'memory',

    async ping() {},

    async putStatus({ botId, state, message, handoffTo }, now = new Date()) {
      reload();
      const row = { botId, state, message, handoffTo: handoffTo ?? null, updatedAt: now.toISOString() };
      data.statuses[botId] = row;
      data.events.push({ ...row });
      if (data.events.length > 2000) data.events = data.events.slice(-2000);
      save();
      return { ...row };
    },

    async listStatuses() {
      reload();
      return Object.values(data.statuses).map((r) => ({ ...r }));
    },

    async putUsage(u, now = new Date()) {
      reload();
      const row = { ...u, receivedAt: now.toISOString() };
      data.usage.push(row);
      if (data.usage.length > 500) data.usage = data.usage.slice(-500);
      save();
      return { ...row };
    },

    async latestUsage() {
      reload();
      if (!data.usage.length) return null;
      let best = data.usage[0];
      for (const u of data.usage) if (Date.parse(u.readAt) >= Date.parse(best.readAt)) best = u;
      return { ...best };
    },

    async recordHeartbeat({ ok, lastPushAt, detail }, now = new Date()) {
      reload();
      const row = { checkedAt: now.toISOString(), ok, lastPushAt: lastPushAt ?? null, detail };
      data.heartbeats.push(row);
      if (data.heartbeats.length > 3000) data.heartbeats = data.heartbeats.slice(-3000);
      save();
      return { ...row };
    },

    async feedInfo() {
      reload();
      const pushes = Object.values(data.statuses).map((r) => Date.parse(r.updatedAt));
      const hb = data.heartbeats;
      return {
        lastPushAt: pushes.length ? new Date(Math.max(...pushes)).toISOString() : null,
        lastHeartbeat: hb.length ? { ...hb[hb.length - 1] } : null,
        firstHeartbeatAt: hb.length ? hb[0].checkedAt : null,
      };
    },

    async putCloudAgentSnapshot({ outcome, detail, running, runningAtLeast, agents }, now = new Date()) {
      reload();
      const row = { checkedAt: now.toISOString(), outcome, detail: detail ?? '', running: running ?? null, runningAtLeast: !!runningAtLeast, agents: clone(agents ?? []) };
      data.cloudAgents.push(row);
      if (data.cloudAgents.length > 600) data.cloudAgents = data.cloudAgents.slice(-600);
      save();
      return clone(row);
    },

    async cloudAgentSnapshots() {
      reload();
      const rows = data.cloudAgents;
      let lastOk = null;
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].outcome === 'ok') { lastOk = rows[i]; break; }
      return { lastAttempt: clone(rows[rows.length - 1] ?? null), lastOk: clone(lastOk) };
    },

    async putProviderReading({ provider, outcome, detail, metrics, readAt }) {
      reload();
      const row = { provider, outcome, detail: detail ?? '', metrics: clone(metrics ?? null), readAt };
      data.providerReadings.push(row);
      if (data.providerReadings.length > 1500) data.providerReadings = data.providerReadings.slice(-1500);
      save();
      return clone(row);
    },

    async providerReadings() {
      reload();
      const out = {};
      for (const r of data.providerReadings) {
        const cur = (out[r.provider] ??= { lastAttempt: null, lastOk: null });
        if (!cur.lastAttempt || Date.parse(r.readAt) >= Date.parse(cur.lastAttempt.readAt)) cur.lastAttempt = r;
        if (r.outcome === 'ok' && (!cur.lastOk || Date.parse(r.readAt) >= Date.parse(cur.lastOk.readAt))) cur.lastOk = r;
      }
      return clone(out);
    },

    async prune() {},
  };
}
