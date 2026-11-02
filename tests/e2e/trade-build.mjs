// Production-build trade pages: gate must allow every hashed chunk; cookieless browser must boot the lounge.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gate, resetTradePublicAssetCache } from '../../lib/gate.js';
import { PASSWORD, startPreviewServer } from './lib.mjs';

export async function runTradeBuildE2e({ check, shot, browser, sessionCookie, storeFile }) {
  resetTradePublicAssetCache();
  const preview = await startPreviewServer({ port: 5200, storeFile, env: {} });
  try {
    const env = { OFFICE_PASSWORD: PASSWORD };
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'lib/trade-public-assets.json'), 'utf8'));
    const decisions = [];
    for (const path of manifest) {
      const decision = await gate(new Request(`http://x${path}`), env);
      decisions.push({ path, action: decision.action });
      const r = await fetch(`${preview.url}${path}`, { redirect: 'manual' });
      check(`Anonymous ${path} is not redirected (${decision.action})`, decision.action === 'next' && r.status === 200, `${decision.action} ${r.status}`);
    }

    const cookie = `office_session=${sessionCookie}`;
    await fetch(`${preview.url}/api/trade/admin/keys`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ label: 'Build bot' }),
    });

    const signedOut = await browser.newContext();
    const page = await signedOut.newPage();
    page.on('pageerror', (e) => check('Production trade lounge no page errors', false, e.message));
    await page.goto(`${preview.url}/trade`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#loading')?.hidden !== false, null, { timeout: 30000 });
    await page.waitForFunction(() => window.__tradeLobby?.ready, null, { timeout: 10000 });
    check('Production build trade lounge boots without office cookie', true);
    await page.waitForTimeout(1200);
    await shot(page, '11-trade-lounge-build.png', 'Production build: trade lounge loads for signed-out visitor');
    await signedOut.close();
    return { manifestDecisions: decisions };
  } finally {
    preview.proc.kill();
  }
}
