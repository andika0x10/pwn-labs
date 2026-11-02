import type { APIRoute } from 'astro';
import { data, failure } from '../../../../lib/api';
import { sessionState } from '../../../../lib/game';
import { env } from 'cloudflare:workers';
import { getPublishedLevels } from '../../../../lib/content';

export const prerender = false;
export const GET: APIRoute = async ({ locals, params }) => {
  if (!locals.user) return failure('AUTH_REQUIRED', 'Masuk untuk membuat sesi level.', 401);
  if (!(await getPublishedLevels()).some((level) => level.data.id === params.id)) return failure('NOT_FOUND', 'Level tidak ditemukan.', 404);
  return data(await sessionState(env, locals.user, params.id!));
};
