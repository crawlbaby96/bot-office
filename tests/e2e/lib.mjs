import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { chromium } from 'playwright';

export const PASSWORD = 'e2e-office-password';
export const PUSH_TOKEN = 'e2e-push-token';
export const CRON_SECRET = 'e2e-cron-secret';

export async function startServer({ port = 5199, storeFile = '/tmp/office-e2e-store.json', fresh = true } = {}) {
  if (fresh) rmSync(storeFile, { force: true });
  const env = {
    ...process.env,
    PORT: String(port),
    OFFICE_PASSWORD: PASSWORD,
    OFFICE_PUSH_TOKEN: PUSH_TOKEN,
    CRON_SECRET,
    OFFICE_STORE_FILE: storeFile,
    DATABASE_URL: '',
  };
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--strictPort'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${url}/login`);
      if (r.ok) return { url, proc, log: () => log, env };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  proc.kill();
  throw new Error(`dev server did not start:\n${log}`);
}

export async function launch() {
  return chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
}

export async function login(page, url) {
  await page.goto(`${url}/`);
  await page.fill('#password', PASSWORD);
  await Promise.all([page.waitForURL(`${url}/`), page.click('#submit')]);
  await page.waitForFunction(() => window.__office?.ready === true, null, { timeout: 60000 });
}

export async function waitSettled(page, timeout = 90000) {
  await page.waitForFunction(() => window.__office.settled(), null, { timeout, polling: 250 });
}
