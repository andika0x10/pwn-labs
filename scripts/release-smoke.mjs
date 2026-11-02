// Jalankan setelah deploy: node scripts/release-smoke.mjs staging --remove-examples --measure
// Membuat akun uji sementara; token sesi tetap di memori dan tidak dicetak.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { root } from './level-files.mjs';
import { fixtures, parsePayload } from './level-fixtures.mjs';
import { traceEvents } from './trace-events.mjs';

const target = process.argv[2];
assert.ok(['local', 'staging', 'production'].includes(target), 'Pilih local, staging, atau production');
const remote = target !== 'local';
const suffix = target === 'staging' ? '-staging' : '';
const base = remote ? 'https://pwn-labs' + suffix + '.andikadinata.workers.dev' : 'http://localhost:4321';
const environment = target === 'staging' ? ['--env', 'staging'] : [];
const directory = path.join(root, 'apps/web');
let localDb;
if (!remote) {
  const storage = path.join(directory, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  for (const name of (await readdir(storage)).filter((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite')) {
    const candidate = new DatabaseSync(path.join(storage, name));
    candidate.exec('PRAGMA busy_timeout=10000');
    if (candidate.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get()) { localDb = candidate; break; }
    candidate.close();
  }
  assert.ok(localDb, 'Database lokal belum diinisialisasi');
}
const run = randomUUID();
const username = 'stack-smoke-' + run.slice(0, 8);
const userId = 'stack-smoke-' + run;
const token = randomBytes(32).toString('hex');
const sessionHash = createHash('sha256').update(token).digest('hex');
const now = Math.floor(Date.now() / 1000);
const backupDir = path.join(root, '.wrangler/stack-release');
await mkdir(backupDir, { recursive: true });
function wrangler(args) {
  const result = spawnSync('npx', ['wrangler', ...args, ...environment], { cwd: directory, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('Wrangler gagal: ' + (result.stderr || result.stdout).slice(-2000));
  return result.stdout;
}
function d1(sql) {
  if (localDb) {
    if (/^SELECT\b/i.test(sql.trim())) return localDb.prepare(sql).all().map((row) => ({ ...row }));
    localDb.exec(sql);
    return [];
  }
  const result = JSON.parse(wrangler(['d1', 'execute', 'pwn-labs-db' + suffix, remote ? '--remote' : '--local', '--command', sql, '--json']));
  assert.ok(result.every((entry) => entry.success), 'Query D1 gagal');
  return result.at(-1).results;
}
const condition = "level_id NOT IN ('example-01', 'example-02')";
const preserved = () => ({
  users: d1('SELECT id FROM users ORDER BY id'),
  sessions: d1('SELECT COUNT(*) AS count FROM sessions'),
  progress: d1('SELECT * FROM progress WHERE ' + condition + ' ORDER BY user_id, level_id'),
  submissions: d1('SELECT * FROM submissions WHERE ' + condition + ' ORDER BY id'),
});
const before = preserved();
const removed = {
  progress: d1("SELECT * FROM progress WHERE level_id IN ('example-01', 'example-02')"),
  submissions: d1("SELECT * FROM submissions WHERE level_id IN ('example-01', 'example-02')"),
};
await writeFile(path.join(backupDir, target + '-examples-' + run + '.json'), JSON.stringify(removed, null, 2), { mode: 0o600 });
if (process.argv.includes('--remove-examples')) {
  if (remote) wrangler(['d1', 'migrations', 'apply', 'pwn-labs-db' + suffix, '--remote']);
  else localDb.exec(await readFile(path.join(root, 'migrations/0002_remove_example_scores.sql'), 'utf8'));
  assert.equal(d1("SELECT COUNT(*) AS count FROM progress WHERE level_id IN ('example-01', 'example-02')")[0].count, 0);
  assert.equal(d1("SELECT COUNT(*) AS count FROM submissions WHERE level_id IN ('example-01', 'example-02')")[0].count, 0);
  assert.deepEqual(preserved(), before, 'Migrasi mengubah data selain kedua soal contoh');
  console.log(target + ': skor contoh dihapus; akun, sesi, dan progress lain tetap sama.');
}
const report = { target, removedProgress: removed.progress.length, removedSubmissions: removed.submissions.length, levels: [], cpu: [] };
let tail, tailOutput = '', tailError = '';
if (remote && process.argv.includes('--measure')) {
  tail = spawn('npx', ['wrangler', 'tail', 'pwn-labs', '--format', 'json', '--header', 'X-Pwn-Smoke:' + run, ...environment], { cwd: directory, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  tail.stdout.on('data', (value) => { tailOutput += value; });
  tail.stderr.on('data', (value) => { tailError += value; });
  await new Promise((resolve) => setTimeout(resolve, 8000));
  assert.equal(tail.exitCode, null, 'Tail tidak berjalan: ' + tailError);
}
const socket = new WebSocket(base.replace(/^http/, 'ws') + '/api/leaderboard/live');
const snapshots = [];
const socketReady = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('WebSocket leaderboard timeout')), 15_000);
  socket.onopen = () => { clearTimeout(timer); resolve(); };
  socket.onerror = () => { clearTimeout(timer); reject(new Error('WebSocket leaderboard gagal')); };
});
socket.onmessage = (event) => { snapshots.push(JSON.parse(event.data)); };
async function request(route, { method = 'GET', payload, authenticated = true, redirect = 'follow' } = {}) {
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(base + route, {
    method, redirect,
    headers: { ...(authenticated ? { Cookie: 'pwn_session=' + token } : {}), Origin: base, 'X-Pwn-Smoke': run, 'X-Pwn-Smoke-Case': new URL(base + route).searchParams.get('case') ?? 'other', ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    body: payload ? JSON.stringify({ payload: [...payload] }) : undefined,
    signal: AbortSignal.timeout(25_000),
      });
      break;
    } catch (error) {
      // Hanya ulangi kegagalan membuka koneksi, ketika request belum terkirim.
      if (attempt === 2 || !['ETIMEDOUT', 'ENETUNREACH', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(error.cause?.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  // Jangan membanjiri stream tail dengan burst submit; setiap sampel harus tercatat.
  if (tail && /[?&]case=/.test(route)) await new Promise((resolve) => setTimeout(resolve, 1000));
  return response;
}
async function waitForSnapshot(predicate) {
  const until = Date.now() + 10_000;
  while (!snapshots.some(predicate) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(snapshots.some(predicate), 'Broadcast leaderboard tidak sesuai');
}
let created = false;
let cleanupError;
try {
  await socketReady;
  d1("INSERT INTO users (id, github_id, username, created_at) VALUES ('" + userId + "', -" + (Date.now()) + ", '" + username + "', " + now + "); INSERT INTO sessions (id, user_id, expires_at) VALUES ('" + sessionHash + "', '" + userId + "', " + (now + 3600) + ")");
  created = true;
  const locked = await request('/api/levels/stack-magic/submit', { method: 'POST', payload: new Uint8Array() });
  assert.equal(locked.status, 403, 'Submit level terkunci diterima');
  const lockedPage = await request('/play/stack/stack-magic', { redirect: 'manual' });
  assert.equal(lockedPage.status, 302);
  assert.equal(lockedPage.headers.get('location'), '/play/stack?locked=1');
  assert.equal((await request('/api/levels/example-01/session')).status, 404);
  const levels = (await fixtures()).sort((a, b) => ['stack-overwrite','stack-magic','stack-offset','stack-ret2win','stack-arguments'].indexOf(a.id) - ['stack-overwrite','stack-magic','stack-offset','stack-ret2win','stack-arguments'].indexOf(b.id));
  const points = [100, 150, 200, 250, 300];
  for (let index = 0; index < levels.length; index++) {
    const { id, solution, negative } = levels[index];
    const path = '/api/levels/' + id;
    const wrong = await request(path + '/submit?smoke=' + run + '&case=wrong', { method: 'POST', payload: parsePayload(negative[0]) });
    assert.equal(wrong.status, 422, id + ': payload salah diterima server');
    if (index === 0) {
      const hint = await request(path + '/hint', { method: 'POST' });
      assert.equal(hint.status, 200);
      const state = await request(path + '/session');
      assert.equal((await state.json()).data.hints, 1);
    }
    const correct = await request(path + '/submit?smoke=' + run + '&case=correct', { method: 'POST', payload: parsePayload(solution) });
    const body = await correct.json();
    assert.equal(correct.status, 200, id + ': solution gagal: ' + JSON.stringify(body));
    assert.match(body.data.flag, /^pwn\{[0-9a-f]{32}\}$/);
    assert.equal(body.data.points, index === 0 ? 90 : points[index], id + ': poin tidak sesuai');
    const repeated = await request(path + '/submit', { method: 'POST', payload: parsePayload(solution) });
    assert.equal((await repeated.json()).data.points, body.data.points, id + ': submit ulang menggandakan poin');
    report.levels.push({ id, points: body.data.points, wrongRejected: true });
    console.log(target + ': ' + id + ' submit benar/salah, poin, dan idempotensi lolos.');
  }
  if (tail) {
    // Tail dapat kehilangan event. Ulangi hanya level yang belum memiliki kedua sampel,
    // tanpa menerima submit idempoten sebagai pengukuran replay.
    for (let round = 0; round < 4; round++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const captured = new Set(traceEvents(tailOutput).flatMap((event) => {
        const headers = Object.fromEntries(Object.entries(event.event?.request?.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
        if (headers['x-pwn-smoke'] !== run) return [];
        if (!event.logs?.some((entry) => JSON.stringify(entry.message).includes('pwn-replay'))) return [];
        const url = event.event?.request?.url;
        return url ? [new URL(url).pathname.split('/')[3] + ':' + headers['x-pwn-smoke-case']] : [];
      }));
      const missing = levels.filter(({ id }) => !captured.has(id + ':wrong') || !captured.has(id + ':correct'));
      if (!missing.length) break;
      for (const { id, solution, negative } of missing) {
        // Seluruh baris ini milik akun sementara; progress pemain lain tidak disentuh.
        d1("DELETE FROM submissions WHERE user_id = '" + userId + "' AND level_id = '" + id + "'; DELETE FROM progress WHERE user_id = '" + userId + "' AND level_id = '" + id + "'");
        const wrong = await request('/api/levels/' + id + '/submit?case=wrong', { method: 'POST', payload: parsePayload(negative[0]) });
        assert.equal(wrong.status, 422, id + ': pengukuran ulang payload salah gagal');
        const correct = await request('/api/levels/' + id + '/submit?case=correct', { method: 'POST', payload: parsePayload(solution) });
        assert.equal(correct.status, 200, id + ': pengukuran ulang solution gagal');
        console.log(target + ': melengkapi sampel CPU ' + id + '.');
      }
    }
  }
  const ranking = await request('/api/leaderboard');
  const rows = (await ranking.json()).data;
  const row = rows.find((entry) => entry.username === username);
  assert.equal(row?.points, 990);
  assert.equal(row?.solved, 5);
  await waitForSnapshot((rows) => rows.some((entry) => entry.username === username && entry.points === 990 && entry.solved === 5));
  for (const route of ['/me', '/u/' + username]) {
    const page = await request(route);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /990 poin/);
    assert.match(html, /5 level selesai/);
  }
  // Logout harus menghapus sesi, kemudian pulihkan hanya sesi akun uji untuk cleanup.
  assert.equal((await request('/auth/logout', { method: 'POST', redirect: 'manual' })).status, 302);
  assert.equal((await request('/api/levels/stack-overwrite/session')).status, 401);
  d1("INSERT INTO sessions (id, user_id, expires_at) VALUES ('" + sessionHash + "', '" + userId + "', " + (now + 3600) + ")");
} finally {
  try {
    if (created) {
      // Penghapusan akun juga membangun ulang dan menyiarkan cache leaderboard dari D1.
      try {
        const deleted = await request('/api/me', { method: 'DELETE' });
        assert.equal(deleted.status, 204, 'API cleanup tidak berhasil');
        await waitForSnapshot((rows) => !rows.some((entry) => entry.username === username));
      } catch (error) {
        d1("DELETE FROM users WHERE id = '" + userId + "'");
        cleanupError = new Error('Cleanup akun memakai fallback D1; cache leaderboard perlu diperiksa', { cause: error });
      }
    }
  } finally {
    socket.close();
    if (tail) {
      await new Promise((resolve) => setTimeout(resolve, 12_000));
      try { process.kill(-tail.pid, 'SIGTERM'); } catch { tail.kill(); }
      tail.stdout.destroy();
      tail.stderr.destroy();
      tail.unref();
    }
  }
}
if (cleanupError) throw cleanupError;
assert.deepEqual(preserved(), before, 'Smoke test mengubah data akun yang sudah ada');
localDb?.close();
const events = traceEvents(tailOutput);
report.trace = { bytes: tailOutput.length, events: events.length, requests: events.map((event) => {
  const request = event.event?.request;
  const url = request?.url ? new URL(request.url) : undefined;
  return { path: url?.pathname, queryKeys: url ? [...url.searchParams.keys()] : [], hasMarker: Object.keys(request?.headers ?? {}).some((key) => key.toLowerCase() === 'x-pwn-smoke'), cpuTime: event.cpuTime };
}) };
for (const event of events) {
    const url = event.event?.request?.url;
    const headers = Object.fromEntries(Object.entries(event.event?.request?.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
    const kind = headers['x-pwn-smoke-case'];
    if (!url || headers['x-pwn-smoke'] !== run || !['wrong', 'correct'].includes(kind)) continue;
    const replay = event.logs?.filter((entry) => JSON.stringify(entry.message).includes('pwn-replay')).map((entry) => entry.message);
    if (!replay?.length) continue;
    report.cpu.push({ level: new URL(url).pathname.split('/')[3], case: kind, cpuTime: event.cpuTime, outcome: event.outcome, replay });
}
await writeFile(path.join(backupDir, target + '-report.json'), JSON.stringify(report, null, 2) + '\n');
if (tail) {
  assert.ok(report.cpu.length >= 10 && report.levels.every(({ id }) => ['wrong', 'correct'].every((kind) => report.cpu.some((sample) => sample.level === id && sample.case === kind))), 'Sampel CPU benar/salah tiap level belum lengkap; lihat laporan .wrangler/stack-release');
  assert.ok(report.cpu.every((entry) => typeof entry.cpuTime === 'number' && entry.cpuTime <= 10 && entry.outcome === 'ok'), 'CPU submit melewati batas 10 ms atau hasil tidak normal');
  console.log(target + ': CPU ' + report.cpu.length + ' submit = ' + report.cpu.map((entry) => entry.cpuTime).join(', ') + ' ms.');
}
console.log(target + ': locking, hint, lima solve, leaderboard WS/polling, profil, logout, dan cleanup lolos.');
