import type { APIRoute } from 'astro';
import { data, failure, readJson } from '../../../../lib/api';
import { validOrigin } from '../../../../lib/auth';
import { leaderboardRows, recordAttempt, score, sessionState } from '../../../../lib/game';
import { getPublishedLevels } from '../../../../lib/content';
import { replayPayload } from '../../../../lib/server-emulator';
import { env } from 'cloudflare:workers';

export const prerender = false;

async function flag(secret: string, userId: string, levelId: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${userId}:${levelId}`)));
  return `pwn{${Array.from(signature.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('')}}`;
}

export const POST: APIRoute = async (context) => {
  const { locals, params } = context;
  if (!locals.user) return failure('AUTH_REQUIRED', 'Masuk untuk mengirim jawaban.', 401);
  if (!validOrigin(context)) return failure('BAD_ORIGIN', 'Origin permintaan tidak valid.', 403);
  const level = (await getPublishedLevels()).find((entry) => entry.data.id === params.id);
  if (!level) return failure('NOT_FOUND', 'Level tidak ditemukan.', 404);
  const db = env.DB;
  if (level.data.requires.length) {
    const placeholders = level.data.requires.map(() => '?').join(',');
    const solved = await db.prepare(`SELECT level_id FROM progress WHERE user_id = ? AND level_id IN (${placeholders})`).bind(locals.user.id, ...level.data.requires).all<{ level_id: string }>();
    if (solved.results.length !== level.data.requires.length) return failure('LEVEL_LOCKED', 'Selesaikan level prasyarat terlebih dahulu.', 403);
  }
  const existing = await db.prepare('SELECT points FROM progress WHERE user_id = ? AND level_id = ?').bind(locals.user.id, level.data.id).first<{ points: number }>();
  const secret = env.FLAG_SECRET || (import.meta.env.DEV ? 'pwn-labs-development-only' : '');
  if (!secret) return failure('SERVER_CONFIG', 'FLAG_SECRET belum dikonfigurasi.', 503);
  if (existing) return data({ solved: true, points: existing.points, flag: await flag(secret, locals.user.id, level.data.id) });
  let body: { payload?: unknown };
  try { body = await readJson(context.request, 20_000); } catch { return failure('INVALID_BODY', 'Body JSON tidak valid atau terlalu besar.', 400); }
  if (!Array.isArray(body.payload) || body.payload.length > 4096 || body.payload.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return failure('INVALID_PAYLOAD', 'Payload harus berupa maksimal 4096 byte.', 400, 'payload');
  }
  const rate = await recordAttempt(env, locals.user, level.data.id);
  if (rate.status === 429) return failure('RATE_LIMITED', 'Batas 10 pengiriman per menit tercapai.', 429);
  const replay = await replayPayload(Uint8Array.from(body.payload));
  if (!replay.reachedWin) return failure('NOT_SOLVED', 'Payload berhenti tanpa mencapai kondisi sukses.', 422);
  const state = await sessionState(env, locals.user, level.data.id);
  const points = score(level.data.points, state.hints);
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO progress (user_id, level_id, solved_at, points, hints_used, attempts) VALUES (?, ?, ?, ?, ?, ?)').bind(locals.user.id, level.data.id, now, points, state.hints, state.attempts),
    db.prepare('INSERT OR IGNORE INTO submissions (user_id, level_id, correct, created_at) VALUES (?, ?, 1, ?)').bind(locals.user.id, level.data.id, now),
  ]);
  const rows = await leaderboardRows(db);
  const leaderboard = env.LEADERBOARD.get(env.LEADERBOARD.idFromName('global'));
  await leaderboard.fetch('https://leaderboard/publish', { method: 'POST', body: JSON.stringify(rows) });
  return data({ solved: true, points, flag: await flag(secret, locals.user.id, level.data.id) });
};
