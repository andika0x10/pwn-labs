import type { APIContext, AstroCookies } from 'astro';

export interface PublicUser { id: string; username: string; avatarUrl: string | null }
const SESSION_COOKIE = 'pwn_session';
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomToken(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return bytesToHex(bytes);
}

export async function sha256(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

export function base64url(bytes: Uint8Array) {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function codeChallenge(verifier: string) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

export function isInternalPath(value: string | null) {
  return !!value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}

export function setSessionCookie(cookies: AstroCookies, token: string, secure: boolean) {
  cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS });
}

export function clearSessionCookie(cookies: AstroCookies) {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function createSession(db: D1Database, userId: string, cookies: AstroCookies, secure: boolean) {
  const token = randomToken();
  const id = await sha256(token);
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  await db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(id, userId, expires).run();
  setSessionCookie(cookies, token, secure);
}

export async function getSessionUser(db: D1Database, cookies: AstroCookies): Promise<PublicUser | null> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const id = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  const row = await db.prepare(`SELECT users.id, users.username, users.avatar_url AS avatarUrl
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ? AND sessions.expires_at > ?`).bind(id, now).first<PublicUser>();
  return row ?? null;
}

export async function destroySession(db: D1Database, cookies: AstroCookies) {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run();
  clearSessionCookie(cookies);
}

export function validOrigin(context: APIContext) {
  const origin = context.request.headers.get('origin');
  return origin === null || origin === context.url.origin;
}
