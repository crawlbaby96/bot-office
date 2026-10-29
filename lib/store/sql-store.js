const iso = (v) => (v == null ? null : new Date(v).toISOString());
const num = (v) => (v == null ? null : Number(v));

function statusRow(r) {
  return { botId: r.bot_id, state: r.state, message: r.message, handoffTo: r.handoff_to, updatedAt: iso(r.updated_at) };
}

function usageRow(r) {
  return {
    percentLeft: num(r.percent_left),
    used: num(r.used),
    limit: num(r.usage_limit),
    resetsAt: iso(r.resets_at),
    readAt: iso(r.read_at),
    receivedAt: iso(r.received_at),
  };
}

const jsonValue = (v) => (typeof v === 'string' ? JSON.parse(v) : v ?? null);

function agentSnapshotRow(r) {
  return {
    checkedAt: iso(r.checked_at),
    outcome: r.outcome,
    detail: r.detail,
    running: r.running == null ? null : Number(r.running),
    runningAtLeast: r.running_at_least,
    agents: jsonValue(r.agents) ?? [],
  };
}

function providerRow(r) {
  return { provider: r.provider, outcome: r.outcome, detail: r.detail, metrics: jsonValue(r.metrics), readAt: iso(r.read_at) };
}

function heartbeatRow(r) {
  return { checkedAt: iso(r.checked_at), ok: r.ok, lastPushAt: iso(r.last_push_at), detail: r.detail };
}

/**
 * Postgres-backed store. `sql` is a tagged-template query function that resolves to an array of rows:
 * `neon(DATABASE_URL)` from @neondatabase/serverless in production, or postgres.js in tests.
 */
export function createSqlStore(sql, { kind = 'postgres' } = {}) {
  return {
    kind,

    async ping() {
      await sql`SELECT 1 AS ok`;
    },

    async putStatus({ botId, state, message, handoffTo }, now = new Date()) {
      const at = now.toISOString();
      const rows = await sql`
        INSERT INTO bot_status (bot_id, state, message, handoff_to, updated_at)
        VALUES (${botId}, ${state}, ${message}, ${handoffTo}, ${at}::timestamptz)
        ON CONFLICT (bot_id) DO UPDATE
          SET state = EXCLUDED.state, message = EXCLUDED.message,
              handoff_to = EXCLUDED.handoff_to, updated_at = EXCLUDED.updated_at
        RETURNING bot_id, state, message, handoff_to, updated_at`;
      await sql`
        INSERT INTO status_events (bot_id, state, message, handoff_to, created_at)
        VALUES (${botId}, ${state}, ${message}, ${handoffTo}, ${at}::timestamptz)`;
      return statusRow(rows[0]);
    },

    async listStatuses() {
      const rows = await sql`SELECT bot_id, state, message, handoff_to, updated_at FROM bot_status`;
      return rows.map(statusRow);
    },

    async putUsage(u, now = new Date()) {
      const rows = await sql`
        INSERT INTO usage_readings (percent_left, used, usage_limit, resets_at, read_at, received_at)
        VALUES (${u.percentLeft}, ${u.used}, ${u.limit}, ${u.resetsAt}::timestamptz, ${u.readAt}::timestamptz, ${now.toISOString()}::timestamptz)
        RETURNING percent_left, used, usage_limit, resets_at, read_at, received_at`;
      return usageRow(rows[0]);
    },

    async latestUsage() {
      const rows = await sql`
        SELECT percent_left, used, usage_limit, resets_at, read_at, received_at
        FROM usage_readings ORDER BY read_at DESC, id DESC LIMIT 1`;
      return rows[0] ? usageRow(rows[0]) : null;
    },

    async recordHeartbeat({ ok, lastPushAt, detail }, now = new Date()) {
      const rows = await sql`
        INSERT INTO feed_heartbeats (checked_at, ok, last_push_at, detail)
        VALUES (${now.toISOString()}::timestamptz, ${ok}, ${lastPushAt}::timestamptz, ${detail})
        RETURNING checked_at, ok, last_push_at, detail`;
      return heartbeatRow(rows[0]);
    },

    async feedInfo() {
      const [push] = await sql`SELECT max(updated_at) AS last_push_at FROM bot_status`;
      const [last] = await sql`SELECT checked_at, ok, last_push_at, detail FROM feed_heartbeats ORDER BY checked_at DESC, id DESC LIMIT 1`;
      const [first] = await sql`SELECT min(checked_at) AS first_at FROM feed_heartbeats`;
      return {
        lastPushAt: iso(push?.last_push_at),
        lastHeartbeat: last ? heartbeatRow(last) : null,
        firstHeartbeatAt: iso(first?.first_at),
      };
    },

    async putCloudAgentSnapshot({ outcome, detail, running, runningAtLeast, agents }, now = new Date()) {
      const rows = await sql`
        INSERT INTO cloud_agent_snapshots (checked_at, outcome, detail, running, running_at_least, agents)
        VALUES (${now.toISOString()}::timestamptz, ${outcome}, ${detail ?? ''}, ${running ?? null}, ${!!runningAtLeast}, ${JSON.stringify(agents ?? [])}::jsonb)
        RETURNING checked_at, outcome, detail, running, running_at_least, agents`;
      return agentSnapshotRow(rows[0]);
    },

    async cloudAgentSnapshots() {
      const [last] = await sql`
        SELECT checked_at, outcome, detail, running, running_at_least, agents
        FROM cloud_agent_snapshots ORDER BY checked_at DESC, id DESC LIMIT 1`;
      const [ok] = await sql`
        SELECT checked_at, outcome, detail, running, running_at_least, agents
        FROM cloud_agent_snapshots WHERE outcome = 'ok' ORDER BY checked_at DESC, id DESC LIMIT 1`;
      return { lastAttempt: last ? agentSnapshotRow(last) : null, lastOk: ok ? agentSnapshotRow(ok) : null };
    },

    async putProviderReading({ provider, outcome, detail, metrics, readAt }) {
      const rows = await sql`
        INSERT INTO provider_usage_readings (provider, outcome, detail, metrics, read_at)
        VALUES (${provider}, ${outcome}, ${detail ?? ''}, ${metrics == null ? null : JSON.stringify(metrics)}::jsonb, ${readAt}::timestamptz)
        RETURNING provider, outcome, detail, metrics, read_at`;
      return providerRow(rows[0]);
    },

    async providerReadings() {
      const last = await sql`
        SELECT DISTINCT ON (provider) provider, outcome, detail, metrics, read_at
        FROM provider_usage_readings ORDER BY provider, read_at DESC, id DESC`;
      const ok = await sql`
        SELECT DISTINCT ON (provider) provider, outcome, detail, metrics, read_at
        FROM provider_usage_readings WHERE outcome = 'ok' ORDER BY provider, read_at DESC, id DESC`;
      const out = {};
      for (const r of last) (out[r.provider] ??= { lastAttempt: null, lastOk: null }).lastAttempt = providerRow(r);
      for (const r of ok) (out[r.provider] ??= { lastAttempt: null, lastOk: null }).lastOk = providerRow(r);
      return out;
    },

    async prune(now = new Date()) {
      const t = now.getTime();
      const d = (days) => new Date(t - days * 86400000).toISOString();
      await sql`DELETE FROM status_events WHERE created_at < ${d(30)}::timestamptz`;
      await sql`DELETE FROM feed_heartbeats WHERE checked_at < ${d(7)}::timestamptz`;
      await sql`DELETE FROM usage_readings WHERE read_at < ${d(90)}::timestamptz
                AND id <> (SELECT id FROM usage_readings ORDER BY read_at DESC, id DESC LIMIT 1)`;
      await sql`DELETE FROM cloud_agent_snapshots WHERE checked_at < ${d(2)}::timestamptz
                AND id <> COALESCE((SELECT id FROM cloud_agent_snapshots WHERE outcome = 'ok' ORDER BY checked_at DESC, id DESC LIMIT 1), 0)`;
      await sql`DELETE FROM provider_usage_readings WHERE read_at < ${d(90)}::timestamptz
                AND id NOT IN (SELECT DISTINCT ON (provider) id FROM provider_usage_readings WHERE outcome = 'ok' ORDER BY provider, read_at DESC, id DESC)`;
    },
  };
}
