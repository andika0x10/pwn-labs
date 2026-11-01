import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { getSessionUser } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.user = await getSessionUser(env.DB, context.cookies);
  return next();
});
