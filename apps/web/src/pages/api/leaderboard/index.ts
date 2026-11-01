import type { APIRoute } from 'astro';
import { data } from '../../../lib/api';
import { leaderboardRows } from '../../../lib/game';
import { env } from 'cloudflare:workers';
export const prerender = false;
export const GET: APIRoute = async () => data(await leaderboardRows(env.DB));
