import { DurableObject } from 'cloudflare:workers';

interface SessionState { seed: number; attempts: number; hints: number; submissions: number[] }

export class LevelSession extends DurableObject {
  private async state(): Promise<SessionState> {
    const existing = await this.ctx.storage.get<SessionState>('state');
    if (existing) return existing;
    const created = { seed: crypto.getRandomValues(new Uint32Array(1))[0], attempts: 0, hints: 0, submissions: [] };
    await this.ctx.storage.put('state', created);
    return created;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const state = await this.state();
    if (request.method === 'GET') return Response.json(state);
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    if (url.pathname.endsWith('/hint')) state.hints = Math.min(state.hints + 1, Math.max(0, Number(url.searchParams.get('max') ?? state.hints + 1)));
    if (url.pathname.endsWith('/attempt')) {
      const now = Date.now();
      state.submissions = state.submissions.filter((stamp) => now - stamp < 60_000);
      if (state.submissions.length >= 10) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });
      state.submissions.push(now);
      state.attempts += 1;
    }
    await this.ctx.storage.put('state', state);
    return Response.json(state);
  }
}

export class Leaderboard extends DurableObject {
  async fetch(request: Request) {
    if (request.headers.get('upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (request.method === 'POST') {
      const snapshot = await request.json();
      await this.ctx.storage.put('snapshot', snapshot);
      for (const socket of this.ctx.getWebSockets()) {
        try { socket.send(JSON.stringify(snapshot)); } catch { socket.close(1011, 'Broadcast gagal'); }
      }
      return new Response(null, { status: 204 });
    }
    return Response.json(await this.ctx.storage.get('snapshot') ?? []);
  }
}

export default { fetch: () => new Response('Durable Object worker', { status: 200 }) };
