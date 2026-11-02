import { spawnSync } from 'node:child_process';

if (!process.env.PLAYWRIGHT_BASE_URL) {
  const server = spawnSync('npm', ['run', 'dev'], { stdio: 'inherit' });
  if (server.status !== 0) process.exit(server.status ?? 1);
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://localhost:4321', { signal: AbortSignal.timeout(2000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Tunggu server background siap. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Dev server background belum siap; periksa astro dev logs.');
}
const tests = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(tests.status ?? 1);
