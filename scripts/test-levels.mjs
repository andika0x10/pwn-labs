import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { buildBlob, buildPayload, createRunner, runBlob } from '../spike/core.mjs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
for (const id of ['example-01', 'example-02']) {
  const binary = new Uint8Array(await readFile(path.join(root, 'apps/web/public/binaries', `${id}.bin`)));
  if (binary.length < 40 || !binary.includes(0xc3)) throw new Error(`${id}: binary fixture tidak valid`);
}

const require = createRequire(import.meta.url);
const MUnicorn = require('../spike/wasm/unicorn_x86.glue.cjs');
const wasmModule = await WebAssembly.compile(await readFile(path.join(root, 'spike/wasm/unicorn_x86.wasm')));
const trampolines = {};
for (const signature of ['vii', 'viii', 'vijii', 'viijiji', 'iiijiji']) {
  trampolines[signature] = new WebAssembly.Module(await readFile(path.join(root, `spike/wasm/tramp_${signature}.wasm`)));
}
const uc = await MUnicorn({
  trampolines,
  instantiateWasm(imports, done) {
    WebAssembly.instantiate(wasmModule, imports).then((instance) => done(instance, wasmModule));
    return {};
  },
});
const fixture = buildBlob();
const payload = buildPayload(fixture.symbols.win);
const fresh = runBlob(uc, fixture, payload);
const reused = createRunner(uc, fixture).run(payload);
if (!fresh.reachedWin || !reused.reachedWin || fresh.stdout !== reused.stdout || fresh.eip !== reused.eip) {
  throw new Error('Replay instance baru dan instance reusable menghasilkan state berbeda.');
}
const bad = createRunner(uc, fixture).run(new Uint8Array(8).fill(0x41));
if (bad.reachedWin) throw new Error('Payload salah mencapai win.');
console.log('Dua level contoh dan replay diferensial Unicorn tervalidasi.');
