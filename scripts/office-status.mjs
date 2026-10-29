#!/usr/bin/env node
// Push a bot status to the Bot Office. Dependency-free (Node 18+).
//
//   node office-status.mjs <botId> <working|waiting|error|done|idle> "<short message>" [handoffToBotId]
//
// Env: OFFICE_URL, OFFICE_PUSH_TOKEN. Exits 0 on failure unless OFFICE_STRICT=1, so it never breaks a task.

const STATES = ['working', 'waiting', 'error', 'done', 'idle'];

function fail(msg) {
  console.error(`office-status: ${msg}`);
  process.exit(process.env.OFFICE_STRICT === '1' ? 1 : 0);
}

const [botId, state, rawMessage = '', handoffTo = ''] = process.argv.slice(2);
if (!botId || !state) fail('usage: office-status.mjs <botId> <state> "<message>" [handoffToBotId]');
if (!STATES.includes(state)) fail(`state must be one of: ${STATES.join(' ')}`);
const url = process.env.OFFICE_URL;
const token = process.env.OFFICE_PUSH_TOKEN;
if (!url) fail('OFFICE_URL is not set');
if (!token) fail('OFFICE_PUSH_TOKEN is not set');

const message = [...rawMessage.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, 80).join('');
const body = { botId, state, message };
if (handoffTo) body.handoffTo = handoffTo;

try {
  const res = await fetch(`${url.replace(/\/+$/, '')}/api/status`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) fail(`HTTP ${res.status} ${await res.text()}`);
  console.log(`office-status: ${state} "${message}"`);
} catch (err) {
  fail(`request failed: ${err.message}`);
}
