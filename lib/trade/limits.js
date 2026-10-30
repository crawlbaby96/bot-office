/** Best-effort per-instance rate limits (serverless-safe, not global). */

const buckets = new Map();

export const LIMITS = {
  botRequestsPerMinute: 120,
  messagesPerRoom: 5000,
  maxMessageChars: 2000,
  maxStatusChars: 80,
  joinPerKeyPerMinute: 30,
};

function windowKey(scope, windowSec) {
  const slot = Math.floor(Date.now() / (windowSec * 1000));
  return `${scope}:${slot}`;
}

export function takeRate(scope, { limit, windowSec = 60 }) {
  const k = windowKey(scope, windowSec);
  const n = (buckets.get(k) ?? 0) + 1;
  buckets.set(k, n);
  if (buckets.size > 5000) {
    for (const key of buckets.keys()) {
      if (key !== k) buckets.delete(key);
    }
  }
  return n <= limit;
}

export function resetRateLimitsForTests() {
  buckets.clear();
}
