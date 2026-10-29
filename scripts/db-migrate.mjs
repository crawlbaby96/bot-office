#!/usr/bin/env node
// Applies db/migrations/*.sql in order, once each. Usage: DATABASE_URL=postgres://... npm run db:migrate
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const dir = join(process.cwd(), 'db', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
let run;
let close = async () => {};
if (isLocal) {
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, { onnotice: () => {} });
  run = (text, params = []) => sql.unsafe(text, params);
  close = () => sql.end();
} else {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  run = (text, params = []) => sql.query(text, params);
}

function statements(text) {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

await run('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
const applied = new Set((await run('SELECT version FROM schema_migrations')).map((r) => r.version));

for (const file of files) {
  if (applied.has(file)) {
    console.log(`skip   ${file}`);
    continue;
  }
  for (const stmt of statements(readFileSync(join(dir, file), 'utf8'))) await run(stmt);
  await run('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
  console.log(`apply  ${file}`);
}
await close();
console.log('Migrations complete.');
