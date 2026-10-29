import { defineConfig, loadEnv } from 'vite';
import officeApi from './dev/vite-office-api.js';

export default defineConfig(({ mode }) => {
  // Server-side env for the local API (OFFICE_PASSWORD, OFFICE_PUSH_TOKEN, ...). Never exposed to the client bundle.
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;

  return {
    plugins: [officeApi()],
    server: { port: Number(process.env.PORT) || 5173, host: true },
    build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  };
});
