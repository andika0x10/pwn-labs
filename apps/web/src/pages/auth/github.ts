import type { APIRoute } from 'astro';
import { codeChallenge, isInternalPath, randomToken } from '../../lib/auth';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, redirect, url }) => {
  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId) return new Response('GITHUB_CLIENT_ID belum dikonfigurasi.', { status: 503 });
  const state = randomToken(20);
  const verifier = randomToken(32);
  const next = isInternalPath(url.searchParams.get('next')) ? url.searchParams.get('next')! : '/play';
  const options = { httpOnly: true, secure: url.protocol === 'https:', sameSite: 'lax' as const, path: '/', maxAge: 600 };
  cookies.set('oauth_state', state, options);
  cookies.set('oauth_verifier', verifier, options);
  cookies.set('oauth_next', next, options);
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', `${url.origin}/auth/github/callback`);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('code_challenge', await codeChallenge(verifier));
  authorize.searchParams.set('code_challenge_method', 'S256');
  authorize.searchParams.set('scope', 'read:user');
  return redirect(authorize.toString());
};
