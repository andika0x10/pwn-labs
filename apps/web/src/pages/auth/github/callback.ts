import type { APIRoute } from 'astro';
import { createSession, isInternalPath } from '../../../lib/auth';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, redirect, url }) => {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = cookies.get('oauth_state')?.value;
  const verifier = cookies.get('oauth_verifier')?.value;
  if (!code || !state || !expected || state !== expected || !verifier) return new Response('State OAuth tidak valid atau sudah kedaluwarsa.', { status: 400 });
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${url.origin}/auth/github/callback`, code_verifier: verifier }),
  });
  const tokenBody = await tokenResponse.json<{ access_token?: string; error_description?: string }>();
  if (!tokenResponse.ok || !tokenBody.access_token) return new Response(tokenBody.error_description ?? 'Pertukaran token GitHub gagal.', { status: 502 });
  const profileResponse = await fetch('https://api.github.com/user', { headers: { authorization: `Bearer ${tokenBody.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'pwn-labs' } });
  const profile = await profileResponse.json<{ id: number; login: string; avatar_url: string }>();
  if (!profileResponse.ok) return new Response('Profil GitHub tidak dapat dibaca.', { status: 502 });
  const db = env.DB;
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO users (id, github_id, username, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(github_id) DO UPDATE SET username = excluded.username, avatar_url = excluded.avatar_url`)
    .bind(id, profile.id, profile.login, profile.avatar_url, Math.floor(Date.now() / 1000)).run();
  const user = await db.prepare('SELECT id FROM users WHERE github_id = ?').bind(profile.id).first<{ id: string }>();
  await createSession(db, user!.id, cookies, url.protocol === 'https:');
  const next = cookies.get('oauth_next')?.value;
  for (const name of ['oauth_state', 'oauth_verifier', 'oauth_next']) cookies.delete(name, { path: '/' });
  return redirect(isInternalPath(next ?? null) ? next! : '/play');
};
