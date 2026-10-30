// Fast visual check of the trade lounge only: node tests/e2e/trade-shots.mjs [outDir]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, login, startServer } from './lib.mjs';
import { runTradeE2e } from './trade.mjs';

const OUT = process.argv[2] || '/tmp/trade-shots';
mkdirSync(OUT, { recursive: true });
const server = await startServer({ port: 5198, storeFile: '/tmp/trade-shots-store.json' });
const browser = await launch();
let fails = 0;
const check = (name, pass, detail = '') => { if (!pass) fails++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const shot = async (page, file) => { await page.screenshot({ path: join(OUT, file) }); console.log(`shot ${join(OUT, file)}`); };
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await login(page, server.url);
  const session = (await ctx.cookies()).find((c) => c.name === 'office_session');
  await ctx.close(); // Stop the office animation before rendering the bar.
  await runTradeE2e({ server, check, shot, page, browser, sessionCookie: session.value, login });
  // Banner close-up: pages expose window.__tradeLobby.focusBanners() if implemented
  const p = await (await browser.newContext()).newPage();
  await p.goto(`${server.url}/trade`);
  await p.waitForFunction(() => window.__tradeLobby?.ready && document.querySelector('#stage canvas'), null, { timeout: 30000 });
  const ok = await p.evaluate(() => (typeof window.__tradeLobby?.focusBanners === 'function' ? (window.__tradeLobby.focusBanners(), true) : false));
  await p.waitForTimeout(1500);
  await shot(p, '12-banners-closeup.png');
  check('focusBanners hook exists', ok);
  await p.context().close();
  const mobile = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await mobile.goto(`${server.url}/trade`);
  await mobile.waitForFunction(() => window.__tradeLobby?.ready);
  await mobile.locator('.room-link').first().click();
  await mobile.waitForFunction(() => document.querySelectorAll('.trade-tag').length >= 2);
  await mobile.waitForTimeout(1500);
  await shot(mobile, '13-room-mobile.png');
  const clear = await mobile.evaluate(() => {
    const sheet = document.querySelector('.watch-main').getBoundingClientRect();
    return [...document.querySelectorAll('.trade-tag')].every(el => {
      const r = el.getBoundingClientRect(); return r.top >= 78 && r.bottom < sheet.top && r.left >= 0 && r.right <= innerWidth;
    });
  });
  check('Mobile bot tags are visible above the feed', clear);
} catch (e) { fails++; console.error(e); }
await browser.close(); server.proc.kill();
console.log(fails ? `${fails} failures` : 'ok');
process.exit(fails ? 1 : 0);
