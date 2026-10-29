#!/usr/bin/env node
// Push a weekly usage reading to the Bot Office usage board. Dependency-free (Node 18+).
//
//   node office-usage.mjs --percent-left 62 --resets-at 2026-11-02T16:00:00Z [--read-at <ISO>]
//   node office-usage.mjs --used 380 --limit 1000 --resets-at <ISO> [--read-at <ISO>]
//
// Env: OFFICE_URL, OFFICE_PUSH_TOKEN. --read-at defaults to now (when the reading was taken).

function fail(msg) {
  console.error(`office-usage: ${msg}`);
  process.exit(process.env.OFFICE_STRICT === '1' ? 1 : 0);
}

const args = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i += 2) {
  if (!args[i].startsWith('--')) fail(`unexpected argument ${args[i]}`);
  opt[args[i].slice(2)] = args[i + 1];
}

const body = { readAt: opt['read-at'] || new Date().toISOString() };
if (opt['percent-left'] != null) body.percentLeft = Number(opt['percent-left']);
if (opt.used != null) body.used = Number(opt.used);
if (opt.limit != null) body.limit = Number(opt.limit);
if (opt['resets-at']) body.resetsAt = opt['resets-at'];
if (body.percentLeft == null && (body.used == null || body.limit == null)) {
  fail('provide --percent-left, or --used and --limit');
}

const url = process.env.OFFICE_URL;
const token = process.env.OFFICE_PUSH_TOKEN;
if (!url) fail('OFFICE_URL is not set');
if (!token) fail('OFFICE_PUSH_TOKEN is not set');

try {
  const res = await fetch(`${url.replace(/\/+$/, '')}/api/usage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) fail(`HTTP ${res.status} ${await res.text()}`);
  const { usage } = await res.json();
  console.log(`office-usage: ${usage.percentLeft}% left, resets ${usage.resetsAt ?? 'unknown'}, read ${usage.readAt}`);
} catch (err) {
  fail(`request failed: ${err.message}`);
}
