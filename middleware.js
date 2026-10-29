import { gate } from './lib/gate.js';

export const config = {
  matcher: ['/((?!favicon\\.svg$).*)'],
};

export default async function middleware(request) {
  const decision = await gate(request, process.env);
  if (decision.action === 'next') {
    return new Response(null, { headers: { 'x-middleware-next': '1' } });
  }
  if (decision.action === 'redirect') {
    return new Response(null, { status: 302, headers: { Location: decision.location, 'Cache-Control': 'no-store' } });
  }
  return new Response(JSON.stringify({ error: decision.body }), {
    status: decision.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
