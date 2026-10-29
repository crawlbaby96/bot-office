import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

const empty = () => ({ statuses: {}, events: [], usage: [], heartbeats: [] });

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

    async prune() {},
  };
}
