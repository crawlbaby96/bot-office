/** WebGL-disabled fallback: trade lounge feed still loads; office shows fallback after login. */
export async function runWebGLFallbackE2e({ server, check, shot, browser, sessionCookie, login, outDir = '/opt/cursor/artifacts/office' }) {
  const blockWebGL = () => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (typeof type === 'string' && /webgl/i.test(type)) return null;
      return orig.call(this, type, attrs);
    };
  };

  const ctx = await browser.newContext();
  await ctx.addInitScript(blockWebGL);
  const trade = await ctx.newPage();
  trade.on('pageerror', (e) => check('Trade lounge survives WebGL block without pageerror', false, e.message));
  await trade.goto(`${server.url}/trade`);
  await trade.waitForFunction(() => window.__tradeLobby?.ready === true, null, { timeout: 30000 });
  await trade.waitForSelector('.stage-fallback', { timeout: 10000 });
  const tradeState = await trade.evaluate(() => ({
    webgl: window.__tradeLobby?.webglAvailable,
    hasFallback: !!document.querySelector('.stage-fallback'),
    feedVisible: !!document.querySelector('.watch-panel.wide'),
    participants: document.querySelector('#participants')?.dataset.empty || document.querySelector('#participants')?.innerText?.slice(0, 80),
  }));
  check('Trade lounge: WebGL unavailable flag is false', tradeState.webgl === false, String(tradeState.webgl));
  check('Trade lounge: fallback panel is shown', tradeState.hasFallback);
  check('Trade lounge: 2D panels remain visible', tradeState.feedVisible);
  await shot(trade, '12-trade-webgl-fallback.png', 'Trade lounge with WebGL blocked: friendly fallback, feed panels still work');

  await trade.waitForTimeout(500);
  const hint = await trade.locator('.stage-fallback-hint').innerText();
  check('Trade fallback mentions hardware acceleration', /hardware acceleration|other tabs/i.test(hint), hint);

  const staffCtx = await browser.newContext();
  await staffCtx.addInitScript(blockWebGL);
  await staffCtx.addCookies([{ name: 'office_session', value: sessionCookie, url: `${server.url}/` }]);
  const office = await staffCtx.newPage();
  office.on('pageerror', (e) => check('Office survives WebGL block without pageerror', false, e.message));
  await office.goto(`${server.url}/`);
  await office.waitForFunction(() => window.__office?.ready === true, null, { timeout: 60000 });
  await office.waitForSelector('.stage-fallback', { timeout: 15000 });
  const officeState = await office.evaluate(() => ({
    webgl: window.__office?.webglAvailable,
    legend: document.querySelector('#legend')?.innerText?.slice(0, 60),
  }));
  check('Office: WebGL unavailable flag is false', officeState.webgl === false, String(officeState.webgl));
  check('Office: HUD legend still renders', !!officeState.legend);
  await shot(office, '12-office-webgl-fallback.png', 'Office with WebGL blocked: fallback overlay, HUD still live');

  await ctx.close();
  await staffCtx.close();
}
