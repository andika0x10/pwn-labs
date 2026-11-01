import type { APIRoute } from 'astro';
import { failure } from '../../lib/api';
import { clearSessionCookie, validOrigin } from '../../lib/auth';
import { env } from 'cloudflare:workers';
export const prerender = false;
export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) return failure('AUTH_REQUIRED', 'Masuk terlebih dahulu.', 401);
  if (!validOrigin(context)) return failure('BAD_ORIGIN', 'Origin permintaan tidak valid.', 403);
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(context.locals.user.id).run();
  clearSessionCookie(context.cookies);
  return new Response(null, { status: 204 });
};
