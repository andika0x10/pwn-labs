import type { PublicUser } from './auth';

export async function sessionState(env: Env, user: PublicUser, levelId: string) {
  const id = env.LEVEL_SESSION.idFromName(`${user.id}:${levelId}`);
  const stub = env.LEVEL_SESSION.get(id);
  const response = await stub.fetch('https://level-session/state');
  return response.json<{ seed: number; attempts: number; hints: number }>();
}

export async function recordAttempt(env: Env, user: PublicUser, levelId: string) {
  const stub = env.LEVEL_SESSION.get(env.LEVEL_SESSION.idFromName(`${user.id}:${levelId}`));
  return stub.fetch('https://level-session/attempt', { method: 'POST' });
}

export async function recordHint(env: Env, user: PublicUser, levelId: string, maximum: number) {
  const stub = env.LEVEL_SESSION.get(env.LEVEL_SESSION.idFromName(`${user.id}:${levelId}`));
  return stub.fetch(`https://level-session/hint?max=${maximum}`, { method: 'POST' });
}

export function score(base: number, hints: number) {
  return Math.max(Math.round(base * 0.5), Math.round(base * (1 - Math.min(hints, 5) * 0.1)));
}

export interface LeaderboardRow { username: string; avatarUrl: string | null; points: number; solved: number }

export async function leaderboardRows(db: D1Database): Promise<LeaderboardRow[]> {
  const result = await db.prepare(`SELECT users.username, users.avatar_url AS avatarUrl,
    COALESCE(SUM(progress.points), 0) AS points, COUNT(progress.level_id) AS solved
    FROM users LEFT JOIN progress ON progress.user_id = users.id
    GROUP BY users.id ORDER BY points DESC, solved DESC, users.created_at ASC LIMIT 100`).all();
  return result.results as unknown as LeaderboardRow[];
}
