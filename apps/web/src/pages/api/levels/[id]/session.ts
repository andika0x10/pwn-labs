import type { APIRoute } from 'astro';
import { data, failure } from '../../../../lib/api';
import { sessionState } from '../../../../lib/game';
import { env } from 'cloudflare:workers';

export const prerender = false;
export const GET: APIRoute = async ({ locals, params }) => {
  if (!locals.user) return failure('AUTH_REQUIRED', 'Masuk untuk membuat sesi level.', 401);
  return data(await sessionState(env, locals.user, params.id!));
};
