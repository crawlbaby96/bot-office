// Local-dev stand-in for the Vercel platform: runs the same gate as middleware.js, routes /api/* to the
// same handler modules Vercel deploys, and fires the crons on the same cadence as Vercel Cron (heartbeat every
// 5 minutes, provider usage hourly).
import { gate } from '../lib/gate.js';

const ROUTES = {
  '/api/login': '/api/login.js',
  '/api/logout': '/api/logout.js',
  '/api/office': '/api/office.js',
  '/api/status': '/api/status.js',
  '/api/usage': '/api/usage.js',
  '/api/cron/heartbeat': '/api/cron/heartbeat.js',
  '/api/cron/usage': '/api/cron/usage.js',
};

const CRONS = [
  { path: '/api/cron/heartbeat', everyMs: 5 * 60 * 1000 },
  { path: '/api/cron/usage', everyMs: 60 * 60 * 1000 },
];

function toRequest(req, origin) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('error', reject);
    req.on('end', () => {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
        else if (v != null) headers.set(k, v);
      }
      if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', req.socket.remoteAddress || '127.0.0.1');
      const hasBody = !['GET', 'HEAD'].includes(req.method);
      resolve(new Request(new URL(req.originalUrl || req.url, origin), {
        method: req.method,
        headers,
        body: hasBody ? Buffer.concat(chunks) : undefined,
      }));
    });
  });
}

async function send(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((v, k) => {
    if (k === 'set-cookie') return;
    res.setHeader(k, v);
  });
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}

export default function officeApi() {
  return {
    name: 'office-api',
    configureServer(server) {
      const loadHandler = (path) => server.ssrLoadModule(path);

      const runCron = async (path) => {
        if (!process.env.CRON_SECRET) return;
        try {
          const mod = await loadHandler(ROUTES[path]);
          await mod.GET(new Request(`http://localhost${path}`, {
            headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
          }));
        } catch (err) {
          server.config.logger.error(`[office] ${path} failed: ${err.message}`);
        }
      };
      for (const c of CRONS) {
        const timer = setInterval(() => runCron(c.path), c.everyMs);
        server.httpServer?.once('close', () => clearInterval(timer));
      }
      if (process.env.OFFICE_DEV_HEARTBEAT_ON_START !== '0') {
        setTimeout(() => runCron('/api/cron/heartbeat'), 2000);
        setTimeout(() => runCron('/api/cron/usage'), 2500);
      }

      server.middlewares.use(async (req, res, next) => {
        try {
          const origin = `http://${req.headers.host || 'localhost'}`;
          const request = await toRequest(req, origin);
          const decision = await gate(request, process.env);
          if (decision.action === 'redirect') {
            res.statusCode = 302;
            res.setHeader('Location', decision.location);
            return res.end();
          }
          if (decision.action === 'deny') {
            res.statusCode = decision.status;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: decision.body }));
          }
          const path = new URL(request.url).pathname.replace(/\/+$/, '');
          if (path === '/login') {
            req.url = '/login.html' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
            return next();
          }
          if (path.startsWith('/api/')) {
            const file = ROUTES[path];
            if (!file) return send(res, new Response('Not found', { status: 404 }));
            const mod = await loadHandler(file);
            const handler = mod[request.method];
            if (typeof handler !== 'function') return send(res, new Response('Method not allowed', { status: 405 }));
            return send(res, await handler(request));
          }
          return next();
        } catch (err) {
          server.config.logger.error(`[office] ${err.stack || err}`);
          res.statusCode = 500;
          res.end('Internal error');
        }
      });
    },
  };
}
