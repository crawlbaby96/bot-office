/**
 * WebGL failure reproduction matrix for /trade and / (office).
 * Edge-on-Mac scenarios use Chromium flags that mirror Edge system settings.
 * Run: node tests/e2e/webgl-probe.mjs [outDir]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { startServer } from './lib.mjs';

const OUT = process.argv[2] || '/opt/cursor/artifacts/webgl-probe';
mkdirSync(OUT, { recursive: true });

const PROBE_INIT = () => {
  window.__webglProbe = { getContextCalls: 0, webglContexts: 0 };
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (typeof type === 'string' && /webgl/i.test(type)) window.__webglProbe.getContextCalls++;
    const ctx = origGetContext.call(this, type, attrs);
    if (ctx && typeof type === 'string' && /webgl/i.test(type)) window.__webglProbe.webglContexts++;
    return ctx;
  };
};

const BLOCK_WEBGL = () => {
  window.__webglProbe = { getContextCalls: 0, webglContexts: 0 };
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (typeof type === 'string' && /webgl/i.test(type)) {
      window.__webglProbe.getContextCalls++;
      return null;
    }
    return orig.call(this, type, attrs);
  };
};

const EDGE_GPU_OFF_ARGS = ['--disable-gpu', '--use-gl=disabled'];
const EDGE_SWIFTSHADER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function probeTrade(launchOpts, url, label, { initScript, browserType = chromium } = {}) {
  const browser = await browserType.launch(launchOpts);
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(initScript ?? PROBE_INIT);
    const page = await context.newPage();
    const pageErrors = [];
    const consoleWebGL = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => {
      const t = m.text();
      if (/webgl|WebGL|THREE/i.test(t)) consoleWebGL.push(t);
    });

    await page.goto(`${url}/trade`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);

    const probe = await page.evaluate(() => ({
      ready: window.__tradeLobby?.ready,
      webglAvailable: window.__tradeLobby?.webglAvailable,
      getContextCalls: window.__webglProbe?.getContextCalls,
      webglContexts: window.__webglProbe?.webglContexts,
      hasCanvas: !!document.querySelector('#stage canvas'),
      hasFallback: !!document.querySelector('.stage-fallback'),
      showsThreeErrorOnPage: document.body.innerText.includes('Error creating WebGL context'),
      loadingHidden: document.getElementById('loading')?.hidden,
      feedPanel: !!document.querySelector('.watch-panel.wide'),
    }));

    const shot = join(OUT, `${label.replace(/[^a-z0-9]+/gi, '-')}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    return { label, probe, pageErrors, consoleWebGL, screenshot: shot };
  } finally {
    await browser.close();
  }
}

async function probeMultiTab(url) {
  const browser = await chromium.launch({ args: EDGE_SWIFTSHADER_ARGS });
  try {
    const context = await browser.newContext();
    await context.addInitScript(PROBE_INIT);
    const pages = [];
    for (let i = 0; i < 10; i++) {
      const p = await context.newPage();
      pages.push(p);
      await p.goto(i % 2 === 0 ? `${url}/trade` : `${url}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await p.waitForTimeout(800);
    }
    const perPage = [];
    for (let i = 0; i < pages.length; i++) {
      perPage.push({
        index: i,
        ...(await pages[i].evaluate(() => ({
          path: location.pathname,
          getContextCalls: window.__webglProbe?.getContextCalls,
          webglContexts: window.__webglProbe?.webglContexts,
          hasCanvas: !!document.querySelector('#stage canvas'),
          tradeReady: window.__tradeLobby?.ready,
          officeReady: window.__office?.ready,
          webglAvailable: window.__tradeLobby?.webglAvailable ?? window.__office?.webglAvailable,
          showsThreeErrorOnPage: document.body.innerText.includes('Error creating WebGL context'),
          hasFallback: !!document.querySelector('.stage-fallback'),
        }))),
      });
    }
    await pages[0].waitForTimeout(30000);
    const afterPoll30s = await pages[0].evaluate(() => ({
      getContextCalls: window.__webglProbe?.getContextCalls,
      webglContexts: window.__webglProbe?.webglContexts,
      canvasCount: document.querySelectorAll('#stage canvas').length,
      ready: window.__tradeLobby?.ready,
    }));
    return { label: 'edge-style-10-tabs-office-and-trade', perPage, afterPoll30s };
  } finally {
    await browser.close();
  }
}

const server = await startServer({ port: 5217 });
const results = {
  edgeNotes: [
    'Microsoft Edge → Settings → System → turn OFF "Use graphics acceleration when available" ≈ Chromium --disable-gpu / --use-gl=disabled.',
    'edge://gpu — "WebGL: Disabled" or blocklisted GPU → Three.js throws unless the app catches it (Chris\'s full-screen THREE.WebGLRenderer message).',
    'Many office + /trade tabs: one WebGLRenderer mount each; context limits (~16) can fail new tabs until others close.',
    'PR #10 CSS2D portraits do not add WebGL contexts; cf7dc17, 04fb564, and ce80843 each use one WebGLRenderer in lounge.js.',
  ],
  commitComparison: {
    cf7dc17: { WebGLRenderer: 1, CSS2DRenderer: 1, note: 'PR #9 baseline' },
    '04fb564': { WebGLRenderer: 1, CSS2DRenderer: 1, note: 'PR #11 SQL; lounge WebGL unchanged vs cf7dc17' },
    ce80843: { WebGLRenderer: 1, CSS2DRenderer: 1, note: 'PR #10/#11 re-land; extra CSS2D only' },
    conclusion:
      '04fb564 vs main (ce80843): no difference in WebGLRenderer count. Chris\'s failure is browser-side (GPU/WebGL unavailable or context limit), not PR #10/#11.',
  },
  scenarios: [],
};

try {
  results.scenarios.push(await probeTrade({ args: EDGE_SWIFTSHADER_ARGS }, server.url, 'chromium-edge-swiftshader'));
  results.scenarios.push(await probeTrade({ args: EDGE_GPU_OFF_ARGS }, server.url, 'chromium-edge-gpu-off'));
  results.scenarios.push(
    await probeTrade({ args: [...EDGE_GPU_OFF_ARGS, '--disable-webgl'] }, server.url, 'chromium-edge-disable-webgl-flag'),
  );
  results.scenarios.push(
    await probeTrade({ args: EDGE_SWIFTSHADER_ARGS }, server.url, 'chromium-edge-block-webgl-js', { initScript: BLOCK_WEBGL }),
  );

  try {
    results.scenarios.push(
      await probeTrade({ channel: 'msedge', args: EDGE_SWIFTSHADER_ARGS }, server.url, 'msedge-channel-swiftshader'),
    );
  } catch (err) {
    results.scenarios.push({ label: 'msedge-channel', skipped: true, reason: err.message });
  }

  results.scenarios.push(await probeTrade({}, server.url, 'webkit', { browserType: webkit }).catch((err) => ({
    label: 'webkit',
    skipped: true,
    reason: err.message.split('\n')[0],
  })));
  results.scenarios.push(await probeTrade({}, server.url, 'firefox', { browserType: firefox }).catch((err) => ({
    label: 'firefox',
    skipped: true,
    reason: err.message.split('\n')[0],
  })));
  results.scenarios.push(await probeMultiTab(server.url));
} finally {
  server.proc.kill();
}

writeFileSync(join(OUT, 'webgl-probe-results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log(`\nWrote ${join(OUT, 'webgl-probe-results.json')}`);
