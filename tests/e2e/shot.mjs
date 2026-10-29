// Dev helper: log in and capture one screenshot per view. Usage: node tests/e2e/shot.mjs [outDir] [view...]
import { mkdirSync } from 'node:fs';
import { launch, login, startServer } from './lib.mjs';

const out = process.argv[2] || 'tests/e2e/out';
const views = process.argv.slice(3).length ? process.argv.slice(3) : ['office', 'rooftop', 'lead', 'board'];
mkdirSync(out, { recursive: true });
const server = await startServer({ port: 5198, storeFile: '/tmp/office-shot-store.json', fresh: false });
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await login(page, server.url);
  await page.waitForTimeout(1500);
  for (const v of views) {
    await page.evaluate((name) => window.__office.view(name), v);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${v}.png` });
  }
  console.log('quality', await page.evaluate(() => window.__office.quality));
} finally {
  await browser.close();
  server.proc.kill();
}
