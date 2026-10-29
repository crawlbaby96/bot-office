import { clearSessionCookie } from '../lib/auth.js';

export async function POST(request) {
  const secure = new URL(request.url).protocol === 'https:';
  return new Response(null, {
    status: 303,
    headers: { Location: '/login', 'Set-Cookie': clearSessionCookie({ secure }), 'Cache-Control': 'no-store' },
  });
}
