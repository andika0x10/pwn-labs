// Asset tervalidasi Fase 0 dibundel statis agar workerd tidak mengompilasi WASM dari bytes.
import MUnicorn from '../generated/unicorn_x86.glue.mjs';
import wasmModule from '../../../../spike/wasm/unicorn_x86.wasm';
import t1 from '../../../../spike/wasm/tramp_iiijiji.wasm';
import t2 from '../../../../spike/wasm/tramp_vii.wasm';
import t3 from '../../../../spike/wasm/tramp_viii.wasm';
import t4 from '../../../../spike/wasm/tramp_viijiji.wasm';
import t5 from '../../../../spike/wasm/tramp_vijii.wasm';
import { createRunner } from '../../../../packages/emulator-core/core.mjs';
import manifest from '../../../../challenges/manifest.json';
import type { ChallengeConfig } from './emulator/types';

const unicorn = MUnicorn({
  trampolines: { iiijiji: t1, vii: t2, viii: t3, viijiji: t4, vijii: t5 },
  instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) {
    done(new WebAssembly.Instance(wasmModule, imports), wasmModule);
    return {};
  },
});
// Worker entrypoint menunggu ini di startup, sebelum Astro melayani request.
export const replayReady = unicorn.then((uc: any) => {
  const runners = new Map<string, ReturnType<typeof createRunner>>();
  for (const [id, challenge] of Object.entries(manifest)) {
    const runner = createRunner(uc, challenge);
    runner.run(new Uint8Array(), { includeMemory: false });
    runners.set(id, runner);
  }
  return runners;
});

export async function replayPayload(level: ChallengeConfig & { id: string }, payload: Uint8Array) {
  const started = performance.now();
  const runners = await replayReady;
  const entry = (manifest as Record<string, (typeof manifest)[keyof typeof manifest]>)[level.id];
  if (!entry || entry.binary !== level.binary || level.arch !== 'x86-32') throw new Error('Challenge tidak tersedia: ' + level.id);
  const runner = runners.get(level.id);
  if (!runner || JSON.stringify(entry.success) !== JSON.stringify(level.success)) throw new Error('Konfigurasi challenge usang: ' + level.id);
  const ready = performance.now();
  // Memori stack rinci hanya diperlukan browser, bukan replay server.
  const result = runner.run(payload, { includeMemory: false });
  return { ...result, metrics: { setupMs: ready - started, replayMs: performance.now() - ready } };
}
