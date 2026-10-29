import { defineConfig, loadEnv } from 'vite';
import officeApi from './dev/vite-office-api.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;

  return {
    plugins: [officeApi()],
    server: { port: Number(process.env.PORT) || 5173, host: true },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        input: {
          main: 'index.html',
          trade: 'trade/index.html',
          tradeRoom: 'trade/room.html',
          tradeAdmin: 'trade/admin.html',
          tradeDocs: 'trade/docs.html',
        },
      },
    },
  };
});
