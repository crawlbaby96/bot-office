import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gate, getTradePublicAssetPaths, resetTradePublicAssetCache } from '../../lib/gate.js';

const env = { OFFICE_PASSWORD: 'correct horse' };
const req = (path, method = 'GET', cookie) =>
  new Request(`http://x${path}`, { method, headers: cookie ? { cookie } : {} });

test('gate: production trade asset manifest allows shared Vite chunks (e.g. lounge-*.js)', async () => {
  execFileSync('npm', ['run', 'build'], { cwd: join(import.meta.dirname, '../..'), stdio: 'pipe' });
  resetTradePublicAssetCache();
  const manifest = [...getTradePublicAssetPaths()];
  assert.ok(manifest.length > 0, 'trade-public-assets.json should list hashed /assets URLs');
  const tradeChunk = manifest.find((p) => /\/assets\/trade-/.test(p));
  assert.ok(tradeChunk, `expected trade entry chunk in manifest, got: ${manifest.join(', ')}`);
  assert.equal((await gate(req(tradeChunk), env)).action, 'next');
  assert.equal((await gate(req('/assets/main-DW2nRet1.js'), env)).action, 'redirect');
  assert.equal((await gate(req('/assets/tradeAdmin-CQzCTYcn.js'), env)).action, 'redirect');
});

test('gate: manifest matches every /assets/ URL in public trade HTML', async () => {
  resetTradePublicAssetCache();
  const root = join(import.meta.dirname, '../..');
  const assetRe = /(?:src|href)="(\/assets\/[^"?#]+)"/g;
  const htmlPaths = ['dist/trade/index.html', 'dist/trade/docs.html'];
  const fromHtml = new Set();
  for (const rel of htmlPaths) {
    const html = readFileSync(join(root, rel), 'utf8');
    for (const m of html.matchAll(assetRe)) fromHtml.add(m[1]);
  }
  const manifest = getTradePublicAssetPaths();
  for (const asset of fromHtml) {
    assert.ok(manifest.has(asset), `manifest missing ${asset}`);
    assert.equal((await gate(req(asset), env)).action, 'next', asset);
  }
});
