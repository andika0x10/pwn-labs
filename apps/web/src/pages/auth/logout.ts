import type { APIRoute } from 'astro';
import { destroySession, validOrigin } from '../../lib/auth';
import { env } from 'cloudflare:workers';

export const prerender = false;
export const POST: APIRoute = async (context) => {
  if (!validOrigin(context)) return new Response('Origin tidak valid.', { status: 403 });
  await destroySession(env.DB, context.cookies);
  return context.redirect('/');
};
