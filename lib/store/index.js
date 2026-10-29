import { join } from 'node:path';
import { createFileStore } from './file-store.js';
import { createSqlStore } from './sql-store.js';

let storePromise = null;

async function createStore(env) {
  if (env.DATABASE_URL) {
    const { neon } = await import('@neondatabase/serverless');
    return createSqlStore(neon(env.DATABASE_URL), { kind: 'neon' });
  }
  if (env.VERCEL) {
    console.warn('[office] DATABASE_URL is not set on Vercel; using a non-persistent in-memory store.');
    return createFileStore();
  }
  const file = env.OFFICE_STORE_FILE || join(process.cwd(), '.data', 'office-store.json');
  return createFileStore({ file: env.OFFICE_STORE_FILE === 'memory' ? null : file });
}

export function getStore(env = process.env) {
  if (!storePromise) storePromise = createStore(env);
  return storePromise;
}
