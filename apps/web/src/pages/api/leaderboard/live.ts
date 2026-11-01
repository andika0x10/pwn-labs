import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
export const prerender = false;
export const GET: APIRoute = async ({ request }) => {
  if (request.headers.get('upgrade') !== 'websocket') return new Response('WebSocket upgrade diperlukan.', { status: 426 });
  const stub = env.LEADERBOARD.get(env.LEADERBOARD.idFromName('global'));
  return stub.fetch(request);
};
