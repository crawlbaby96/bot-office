// End-to-end verification: runs the local dev server (same handlers as Vercel), pushes real statuses through the
// CLI scripts, drives the UI with Playwright, and writes screenshots plus a JSON summary.
//
//   node tests/e2e/run.mjs [outDir]      (default /opt/cursor/artifacts/office)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { CRON_SECRET, launch, login, PUSH_TOKEN, startServer, waitSettled } from './lib.mjs';

const OUT = process.argv[2] || '/opt/cursor/artifacts/office';
mkdirSync(OUT, { recursive: true });
const roster = JSON.parse(readFileSync('config/roster.json', 'utf8'));
const byName = Object.fromEntries(roster.bots.map((b) => [b.name, b.id]));
const LEAD = roster.lead;

const summary = { startedAt: new Date().toISOString(), screenshots: [], checks: [], consoleErrors: [] };
const check = (name, pass, detail = '') => {
  summary.checks.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const shot = async (page, file, note) => {
  const path = join(OUT, file);
  await page.screenshot({ path });
  summary.screenshots.push({ file: path, note });
  console.log(`shot  ${file}  ${note}`);
};

const server = await startServer({ port: 5199 });
const cli = (script, args) => {
  const env = { ...process.env, OFFICE_URL: server.url, OFFICE_PUSH_TOKEN: PUSH_TOKEN, OFFICE_STRICT: '1' };
  const bin = script.endsWith('.sh') ? 'bash' : process.execPath;
  return execFileSync(bin, [join('scripts', script), ...args], { env, encoding: 'utf8' }).trim();
};

async function apiChecks() {
  const u = server.url;
  const r1 = await fetch(`${u}/`, { redirect: 'manual' });
  check('Unauthenticated page request redirects to /login', r1.status === 302 && r1.headers.get('location')?.startsWith('/login'), `${r1.status} ${r1.headers.get('location')}`);
  const r2 = await fetch(`${u}/src/main.js`, { redirect: 'manual' });
  check('Unauthenticated asset request is blocked', r2.status === 302, String(r2.status));
  for (const path of ['/api/office', '/api/status', '/api/usage']) {
    const r = await fetch(`${u}${path}`);
    check(`Unauthenticated GET ${path} is 401`, r.status === 401, String(r.status));
  }
  const t0 = Date.now();
  const bad = await fetch(`${u}/api/login`, { method: 'POST', body: 'password=wrong', headers: { 'content-type': 'application/x-www-form-urlencoded' }, redirect: 'manual' });
  const elapsed = Date.now() - t0;
  check('Wrong password is rejected after a delay', bad.status === 303 && bad.headers.get('location').includes('error=1') && elapsed >= 1000, `${bad.status}, ${elapsed} ms`);
  const post = (path, body, token = PUSH_TOKEN) => fetch(`${u}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  let r = await post('/api/status', { botId: LEAD, state: 'working', message: 'x' }, 'wrong-token');
  check('POST /api/status with wrong bearer token is 401', r.status === 401, String(r.status));
  r = await post('/api/status', { botId: LEAD, state: 'working', message: 'x' }, null);
  check('POST /api/status without token is 401', r.status === 401, String(r.status));
  r = await post('/api/status', { botId: LEAD, state: 'working', message: 'x'.repeat(81) });
  check('Status message over 80 chars is rejected (400)', r.status === 400, (await r.json()).error);
  r = await post('/api/status', { botId: 'not-a-bot', state: 'working', message: 'x' });
  check('Unknown botId is rejected (400)', r.status === 400, String(r.status));
  r = await post('/api/status', { botId: LEAD, state: 'sleeping', message: 'x' });
  check('Invalid state is rejected (400)', r.status === 400, String(r.status));
  r = await post('/api/usage', { percentLeft: 140 });
  check('Usage percentLeft out of range is rejected (400)', r.status === 400, String(r.status));
  r = await fetch(`${u}/api/cron/heartbeat`);
  check('Cron heartbeat without CRON_SECRET is 401', r.status === 401, String(r.status));
  r = await fetch(`${u}/api/cron/heartbeat`, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const hb = await r.json();
  check('Cron heartbeat with CRON_SECRET records feed health', r.status === 200 && hb.ok === true, JSON.stringify(hb.heartbeat));
}

function readPng(path) {
  return PNG.sync.read(readFileSync(path));
}

function stabilityDiff(aPath, bPath, boxes, outPath, dpr) {
  const a = readPng(aPath);
  const b = readPng(bPath);
  const { width, height } = a;
  const diff = new PNG({ width, height });
  pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0, includeAA: true, alpha: 0.35 });
  const changed = new Uint8Array(width * height);
  let total = 0;
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (a.data[o] !== b.data[o] || a.data[o + 1] !== b.data[o + 1] || a.data[o + 2] !== b.data[o + 2]) {
      changed[i] = 1;
      total++;
    }
  }
  const perBot = [];
  const clip = (r) => {
    const c = (v, max) => Math.max(0, Math.min(max, v));
    return {
      x0: c(Math.floor(r.x0 * dpr), width - 1),
      x1: c(Math.ceil(r.x1 * dpr), width - 1),
      y0: c(Math.floor(r.y0 * dpr), height - 1),
      y1: c(Math.ceil(r.y1 * dpr), height - 1),
    };
  };
  const outline = (r, color) => {
    const { x0, x1, y0, y1 } = clip(r);
    if (x1 <= x0 || y1 <= y0) return;
    for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) diff.data.set(color, (y * width + x) * 4);
    for (let y = y0; y <= y1; y++) for (const x of [x0, x1]) diff.data.set(color, (y * width + x) * 4);
  };
  const count = (r) => {
    let n = 0;
    let area = 0;
    const { x0, x1, y0, y1 } = clip(r);
    if (x1 <= x0 || y1 <= y0) return { n, area };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      area++;
      n += changed[y * width + x];
    }
    return { n, area };
  };
  for (const bx of boxes) {
    const body = count(bx.body);
    const tag = count(bx.tag);
    perBot.push({ name: bx.name, bodyPixels: body.area, bodyChanged: body.n, tagPixels: tag.area, tagChanged: tag.n });
    outline(bx.body, [40, 200, 90, 255]);
    outline(bx.tag, [60, 140, 255, 255]);
  }
  writeFileSync(outPath, PNG.sync.write(diff));
  return { width, height, totalChangedPixels: total, botAndTagChangedPixels: perBot.reduce((s, p) => s + p.bodyChanged + p.tagChanged, 0), perBot };
}

function nextMondayNineAmPacific() {
  const d = new Date();
  d.setUTCHours(16, 0, 0, 0);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (((8 - day) % 7) || 7));
  return d.toISOString();
}

const browser = await launch();
try {
  await apiChecks();

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const posts = [];
  page.on('request', (req) => req.method() === 'POST' && posts.push(req.url()));
  page.on('console', (m) => m.type() === 'error' && summary.consoleErrors.push(m.text()));
  page.on('pageerror', (e) => summary.consoleErrors.push(e.message));

  // 1. Password gate.
  await page.goto(`${server.url}/`);
  check('Browser is redirected to the password page', page.url().startsWith(`${server.url}/login`), page.url());
  await shot(page, '01-password-gate.png', 'Password gate shown before anything else loads');
  await page.fill('#password', 'not-the-password');
  await Promise.all([page.waitForURL(/error=1/), page.click('#submit')]);
  await shot(page, '01b-password-wrong.png', 'Wrong password: generic error after a server-side delay');

  // 2. Empty office (no statuses pushed yet).
  await login(page, server.url);
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === 'office_session');
  check('Session cookie is httpOnly + SameSite=Lax', session?.httpOnly && session?.sameSite === 'Lax', JSON.stringify({ httpOnly: session?.httpOnly, sameSite: session?.sameSite }));
  await waitSettled(page);
  await page.waitForTimeout(2500);
  const q1 = await page.evaluate(() => window.__office.quality);
  check('Renderer pixel ratio equals devicePixelRatio (desktop)', q1.pixelRatio === q1.devicePixelRatio, JSON.stringify(q1));
  await shot(page, '02-empty-office.png', 'Empty office: no statuses pushed, everyone idle in lounge / rooftop, usage board says no reading yet');
  const banner0 = await page.locator('#banner').isVisible();
  check('No warning banner for an idle office', !banner0);

  // 3. Idle stability: two screenshots 1 s apart and a pixel diff over every bot body and name tag.
  const boxes = await page.evaluate(() => window.__office.botScreenBoxes());
  const idleA = join(OUT, '03a-idle-t0.png');
  const idleB = join(OUT, '03b-idle-t1s.png');
  await page.screenshot({ path: idleA });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: idleB });
  const boxesAfter = await page.evaluate(() => window.__office.botScreenBoxes());
  const diff = stabilityDiff(idleA, idleB, boxes, join(OUT, '03c-idle-diff.png'), 1);
  diff.boxesUnchanged = JSON.stringify(boxes) === JSON.stringify(boxesAfter);
  writeFileSync(join(OUT, '03-idle-stability.json'), JSON.stringify(diff, null, 2));
  summary.screenshots.push({ file: idleA, note: 'Idle scene t=0' }, { file: idleB, note: 'Idle scene t=1s' }, { file: join(OUT, '03c-idle-diff.png'), note: 'Pixel diff (red = changed). Green boxes = bot bodies, blue = name tags' });
  check('Idle bots and tags do not move between screenshots 1 s apart', diff.botAndTagChangedPixels === 0 && diff.boxesUnchanged, `bot/tag changed pixels: ${diff.botAndTagChangedPixels}; total changed pixels (animated screens/LEDs/HUD): ${diff.totalChangedPixels}`);

  // 4. Real statuses pushed through the CLI scripts.
  const pushes = [
    ['office-status.sh', 'Grok Bot', 'working', 'Coordinating the team'],
    ['office-status.sh', 'Sparky', 'working', 'Reviewing a pull request'],
    ['office-status.sh', 'Forge', 'working', 'Building a release'],
    ['office-status.mjs', 'Debra Credit', 'waiting', 'Waiting on Chris for approval'],
    ['office-status.mjs', 'Kaptain', 'error', 'Sync failed, needs a look'],
    ['office-status.sh', 'Lead Zepplin', 'working', 'Updating the pipeline'],
    ['office-status.mjs', 'Spara-ganda', 'working', 'Drafting a campaign'],
    ['office-status.sh', 'Sift', 'working', 'Analyzing a dataset'],
    ['office-status.mjs', 'Granola Bot', 'done', 'Meeting notes filed'],
    ['office-status.sh', 'Pickolas Cage', 'working', 'Reviewing tonight\'s lines'],
  ];
  const cliOut = [];
  for (const [script, name, state, msg] of pushes) cliOut.push(cli(script, [byName[name], state, msg]));
  writeFileSync(join(OUT, '04-cli-output.txt'), cliOut.join('\n') + '\n');
  check('CLI scripts pushed statuses (bash + node)', cliOut.every((l) => l.startsWith('office-status:')), `${cliOut.length} pushes`);
  await page.evaluate(() => window.__office.pollNow());
  await waitSettled(page, 120000);
  await page.waitForTimeout(800);
  await shot(page, '04-live-status.png', 'After pushing real statuses with scripts/office-status.sh and .mjs: working bots at desks (rooftop bot at a hot desk), waiting = ?, error = red dot');
  const legend = await page.locator('#legend').innerText();
  check('Legend counts reflect pushed statuses', /7 working/.test(legend) && /1 waiting/.test(legend) && /1 error/.test(legend) && /1 done/.test(legend), legend.replace(/\n/g, ' '));

  // 5. Handoff: Sparky finishes and carries a folder to the lead's office.
  cli('office-status.sh', [byName.Sparky, 'done', 'Review finished, handing off', LEAD]);
  await page.evaluate(() => window.__office.pollNow());
  await page.waitForFunction((id) => { const a = window.__office.agentInfo(id); return a.carrying && a.x > 0; }, byName.Sparky, { timeout: 120000, polling: 100 });
  await page.evaluate(() => window.__office.frame(9, 0.6, -6.5, 24));
  await shot(page, '05a-handoff-walking.png', 'Handoff in progress: Sparky walks the corridor toward the lead office carrying a folder');
  await page.evaluate(() => window.__office.view('lead'));
  await page.waitForFunction((id) => { const a = window.__office.agentInfo(id); return a.carrying && a.z < -13.5; }, byName.Sparky, { timeout: 120000, polling: 100 });
  await shot(page, '05b-handoff-arriving.png', 'Sparky reaches Grok Bot\'s desk in the glass corner office and hands over the folder');
  await page.waitForFunction(() => window.__office.settled(), null, { timeout: 120000, polling: 250 });
  await page.waitForTimeout(800);
  await shot(page, '05c-handoff-delivered.png', 'Handoff delivered: folder on the lead desk; Sparky (done) went back to the lounge');

  // 6. Usage board with a real pushed reading.
  const resetsAt = nextMondayNineAmPacific();
  const usageOut = cli('office-usage.sh', ['62', resetsAt]);
  writeFileSync(join(OUT, '06-usage-cli-output.txt'), usageOut + '\n');
  await page.evaluate(() => window.__office.pollNow());
  await page.evaluate(() => window.__office.view('board'));
  await page.waitForTimeout(1200);
  await shot(page, '06-usage-board.png', `Usage board after pushing a reading with scripts/office-usage.sh (62% left, resets ${resetsAt})`);
  const chip = await page.locator('#usage-chip').innerText();
  check('Usage chip shows the pushed reading', chip.includes('62%'), chip.replace(/\n/g, ' '));

  // 7. Hover tag details.
  await page.evaluate(() => window.__office.view('office'));
  await page.waitForTimeout(800);
  const pos = await page.evaluate((id) => window.__office.screenPos(id, 0.7), byName['Debra Credit']);
  await page.mouse.move(pos.x, pos.y);
  await page.waitForTimeout(500);
  const tip = await page.locator('#tooltip').innerText();
  check('Hover shows full name, title and current status', tip.includes('Debra Credit') && tip.includes('Accounting Manager') && tip.includes('Waiting on Chris for approval'), tip.replace(/\n/g, ' | '));
  await shot(page, '07-hover-tag.png', 'Hovering a bot shows full name, title, state, status message and age');
  await page.mouse.move(5, 450);

  // 8. Rooftop.
  await page.evaluate(() => window.__office.view('rooftop'));
  await page.waitForTimeout(1200);
  await shot(page, '08-rooftop.png', 'Rooftop deck: rooftop-zone bots idle around the fire pit (Pickolas Cage is at a hot desk because it is working)');

  // 9. Simulation (browser only).
  const postsBefore = posts.length;
  await page.evaluate(() => window.__office.view('office'));
  await page.click('#simulate');
  await page.waitForTimeout(12000);
  await shot(page, '09-simulation.png', 'Simulate Work running: busy day played in the browser, Simulation label shown');
  const simLabel = await page.locator('#sim-label').innerText();
  check('Simulation label visible while running', (await page.locator('#sim-label').isVisible()) && simLabel.startsWith('Simulation'), simLabel);
  await page.waitForTimeout(6000);
  const simPosts = posts.slice(postsBefore).filter((u) => u.includes('/api/status') || u.includes('/api/usage'));
  check('Simulation never writes to the status or usage API', simPosts.length === 0, `${simPosts.length} POSTs`);
  await page.click('#simulate');
  await page.waitForTimeout(500);
  check('Stopping simulation hides the label', !(await page.locator('#sim-label').isVisible()));

  const simPage = await context.newPage();
  await simPage.goto(`${server.url}/?simulate=1`);
  await simPage.waitForFunction(() => window.__office?.ready === true, null, { timeout: 60000 });
  await simPage.waitForTimeout(8000);
  check('?simulate=1 starts the simulation from the link', await simPage.evaluate(() => window.__office.simulating()));
  await shot(simPage, '09b-simulate-link.png', 'Opened with ?simulate=1');
  await simPage.close();

  // 10. Mobile viewport.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await mobile.addCookies(cookies);
  const mpage = await mobile.newPage();
  mpage.on('pageerror', (e) => summary.consoleErrors.push(`mobile: ${e.message}`));
  await mpage.goto(`${server.url}/`);
  await mpage.waitForFunction(() => window.__office?.ready === true, null, { timeout: 90000 });
  await mpage.waitForTimeout(4000);
  const q2 = await mpage.evaluate(() => window.__office.quality);
  check('Renderer pixel ratio equals devicePixelRatio (mobile, DPR 3)', q2.pixelRatio === 3 && q2.devicePixelRatio === 3, JSON.stringify(q2));
  await shot(mpage, '10-mobile-390x844.png', 'Mobile 390x844 (DPR 3)');
  const mpos = await mpage.evaluate((id) => window.__office.screenPos(id, 0.7), byName.Kaptain);
  await mpage.touchscreen.tap(mpos.x, mpos.y);
  await mpage.waitForTimeout(600);
  const mtip = await mpage.locator('#tooltip').innerText().catch(() => '');
  check('Tap on mobile shows bot details', mtip.includes('Kaptain'), mtip.replace(/\n/g, ' | '));
  await shot(mpage, '10b-mobile-tap.png', 'Mobile: tapping a bot shows its details');
  await mobile.close();

  check('No browser console errors', summary.consoleErrors.length === 0, summary.consoleErrors.slice(0, 3).join(' / '));
} catch (err) {
  console.error(err);
  check('E2E run completed without exceptions', false, err.message);
} finally {
  await browser.close();
  server.proc.kill();
  summary.finishedAt = new Date().toISOString();
  summary.passed = summary.checks.every((c) => c.pass);
  writeFileSync(join(OUT, 'e2e-summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.checks.filter((c) => c.pass).length}/${summary.checks.length} checks passed. Output: ${OUT}`);
  process.exit(summary.passed ? 0 : 1);
}
