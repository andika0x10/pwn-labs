import type { APIRoute } from 'astro';
import { data, failure } from '../../../../lib/api';
import { validOrigin } from '../../../../lib/auth';
import { recordHint } from '../../../../lib/game';
import { env } from 'cloudflare:workers';
import { getPublishedLevels } from '../../../../lib/content';

export const prerender = false;
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return failure('AUTH_REQUIRED', 'Masuk untuk menyimpan hint.', 401);
  if (!validOrigin(context)) return failure('BAD_ORIGIN', 'Origin permintaan tidak valid.', 403);
  const level = (await getPublishedLevels()).find((entry) => entry.data.id === context.params.id);
  if (!level) return failure('NOT_FOUND', 'Level tidak ditemukan.', 404);
  const response = await recordHint(env, context.locals.user, context.params.id!, level.data.hints.length);
  return data(await response.json());
};
