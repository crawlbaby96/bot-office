import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** HTML entry points for the password-free trade lounge (not staff admin). */
const PUBLIC_TRADE_HTML = ['trade/index.html', 'trade/room.html', 'trade/docs.html'];

const HTML_ASSET_RE = /(?:src|href)="(\/assets\/[^"?#]+)"/g;
const FROM_IMPORT_RE = /(?:from|import)\("\.\/([^"]+)"/g;
const DYNAMIC_IMPORT_RE = /import\("\.\/([^"]+)"/g;
const QUOTED_ASSET_RE = /"assets\/([^"]+\.(?:js|css))"/g;

function collectAssetPathsFromHtml(html) {
  const assets = new Set();
  for (const m of html.matchAll(HTML_ASSET_RE)) assets.add(m[1]);
  return assets;
}

function distAssetFile(outDir, assetPath) {
  return join(outDir, assetPath.replace(/^\//, ''));
}

/** Follow static and Vite preload-map references from entry scripts. */
function collectTransitiveAssets(outDir, seeds) {
  const all = new Set(seeds);
  const queue = [...seeds];
  while (queue.length) {
    const assetPath = queue.pop();
    if (!assetPath.endsWith('.js')) continue;
    const file = distAssetFile(outDir, assetPath);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const found = new Set();
    for (const re of [FROM_IMPORT_RE, DYNAMIC_IMPORT_RE, QUOTED_ASSET_RE]) {
      for (const m of text.matchAll(re)) {
        const tail = re === QUOTED_ASSET_RE ? m[1] : m[1];
        found.add(`/assets/${tail.replace(/^assets\//, '')}`);
      }
    }
    for (const dep of found) {
      if (!all.has(dep)) {
        all.add(dep);
        queue.push(dep);
      }
    }
  }
  return all;
}

/** After Vite build, record every hashed /assets URL the public trade pages need. */
export function tradePublicAssetsPlugin() {
  return {
    name: 'trade-public-assets',
    closeBundle() {
      const root = process.cwd();
      const outDir = join(root, 'dist');
      const seeds = new Set();
      for (const rel of PUBLIC_TRADE_HTML) {
        const html = readFileSync(join(outDir, rel), 'utf8');
        for (const asset of collectAssetPathsFromHtml(html)) seeds.add(asset);
      }
      const all = collectTransitiveAssets(outDir, seeds);
      const list = [...all].sort();
      writeFileSync(join(root, 'lib', 'trade-public-assets.json'), `${JSON.stringify(list, null, 2)}\n`);
    },
  };
}
