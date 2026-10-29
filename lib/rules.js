export const STATES = ['working', 'waiting', 'error', 'done', 'idle'];
export const MAX_MESSAGE_LENGTH = 80;
export const WORKING_STALE_MS = 10 * 60 * 1000;
export const NO_PUSH_WARNING_MS = 45 * 60 * 1000;
export const DEFAULT_HEARTBEAT_STALE_MINUTES = 20;

function fail(error) {
  return { ok: false, error };
}

export function normalizeMessage(message) {
  return String(message ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateStatus(body, rosterIds) {
  if (!body || typeof body !== 'object') return fail('Body must be a JSON object');
  const botId = typeof body.botId === 'string' ? body.botId.trim() : '';
  if (!botId) return fail('botId is required');
  if (!rosterIds.has(botId)) return fail('botId is not on the roster');
  const state = typeof body.state === 'string' ? body.state.trim().toLowerCase() : '';
  if (!STATES.includes(state)) return fail(`state must be one of: ${STATES.join(', ')}`);
  if (body.message != null && typeof body.message !== 'string') return fail('message must be a string');
  const message = normalizeMessage(body.message);
  if (message.length > MAX_MESSAGE_LENGTH) {
    return fail(`message must be ${MAX_MESSAGE_LENGTH} characters or fewer (got ${message.length})`);
  }
  let handoffTo = null;
  if (body.handoffTo != null && body.handoffTo !== '') {
    if (typeof body.handoffTo !== 'string' || !rosterIds.has(body.handoffTo.trim())) {
      return fail('handoffTo must be a bot id on the roster');
    }
    handoffTo = body.handoffTo.trim();
    if (handoffTo === botId) return fail('handoffTo cannot be the same bot');
  }
  return { ok: true, value: { botId, state, message, handoffTo } };
}

/** A 'working' status with no update for 10 minutes is shown as idle. */
export function effectiveStatus(row, nowMs = Date.now()) {
  const updatedMs = Date.parse(row.updatedAt);
  const stale = row.state === 'working' && nowMs - updatedMs >= WORKING_STALE_MS;
  return {
    botId: row.botId,
    state: row.state,
    effectiveState: stale ? 'idle' : row.state,
    stale,
    message: row.message,
    handoffTo: row.handoffTo ?? null,
    updatedAt: row.updatedAt,
  };
}

function parseDate(value, field) {
  if (value == null || value === '') return { ok: true, value: null };
  const ms = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return fail(`${field} must be an ISO-8601 date`);
  return { ok: true, value: new Date(ms).toISOString() };
}

function finiteNumber(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function validateUsage(body, nowMs = Date.now()) {
  if (!body || typeof body !== 'object') return fail('Body must be a JSON object');
  const percentIn = finiteNumber(body.percentLeft);
  const used = finiteNumber(body.used);
  const limit = finiteNumber(body.limit);
  if (Number.isNaN(percentIn) || Number.isNaN(used) || Number.isNaN(limit)) {
    return fail('percentLeft, used and limit must be numbers');
  }
  let percentLeft;
  if (percentIn != null) {
    if (percentIn < 0 || percentIn > 100) return fail('percentLeft must be between 0 and 100');
    percentLeft = percentIn;
  } else if (used != null && limit != null) {
    if (limit <= 0 || used < 0) return fail('used must be >= 0 and limit > 0');
    percentLeft = Math.max(0, Math.min(100, (1 - used / limit) * 100));
  } else {
    return fail('Provide percentLeft, or used and limit');
  }
  const resetsAt = parseDate(body.resetsAt, 'resetsAt');
  if (!resetsAt.ok) return resetsAt;
  const readAt = parseDate(body.readAt, 'readAt');
  if (!readAt.ok) return readAt;
  const readAtIso = readAt.value ?? new Date(nowMs).toISOString();
  if (Date.parse(readAtIso) > nowMs + 5 * 60 * 1000) return fail('readAt is in the future');
  return {
    ok: true,
    value: {
      percentLeft: Math.round(percentLeft * 100) / 100,
      used: used ?? null,
      limit: limit ?? null,
      resetsAt: resetsAt.value,
      readAt: readAtIso,
    },
  };
}

/**
 * Warnings appear only when the feed itself fails or no status push has arrived for 45+ minutes.
 * Idle bots are normal and never produce a warning.
 */
export function computeFeedHealth({ nowMs = Date.now(), lastPushAt, lastHeartbeat, firstHeartbeatAt, storeError, heartbeatStaleMinutes }) {
  const warnings = [];
  if (storeError) warnings.push('Status feed unavailable: the status store could not be read.');
  if (lastHeartbeat && !lastHeartbeat.ok) {
    warnings.push(`Feed heartbeat failed${lastHeartbeat.detail ? `: ${lastHeartbeat.detail}` : ''}.`);
  }
  const staleMin = Number(heartbeatStaleMinutes) > 0 ? Number(heartbeatStaleMinutes) : DEFAULT_HEARTBEAT_STALE_MINUTES;
  if (lastHeartbeat && nowMs - Date.parse(lastHeartbeat.checkedAt) > staleMin * 60 * 1000) {
    warnings.push('Feed heartbeat has stopped (cron has not run recently).');
  }
  if (!storeError) {
    if (lastPushAt) {
      const ageMs = nowMs - Date.parse(lastPushAt);
      if (ageMs >= NO_PUSH_WARNING_MS) {
        warnings.push(`No status push received for ${formatAge(ageMs)}.`);
      }
    } else if (firstHeartbeatAt && nowMs - Date.parse(firstHeartbeatAt) >= NO_PUSH_WARNING_MS) {
      warnings.push('No status push has been received yet.');
    }
  }
  return {
    ok: warnings.length === 0,
    warnings,
    lastPushAt: lastPushAt ?? null,
    lastHeartbeatAt: lastHeartbeat?.checkedAt ?? null,
  };
}

function formatAge(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 120) return `${min} minutes`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} hours`;
  return `${Math.floor(h / 24)} days`;
}
