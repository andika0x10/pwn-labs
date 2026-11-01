// Asset tervalidasi Fase 0 dibundel statis agar workerd tidak mengompilasi WASM dari bytes.
import MUnicorn from '../generated/unicorn_x86.glue.mjs';
import wasmModule from '../../../../spike/wasm/unicorn_x86.wasm';
import t1 from '../../../../spike/wasm/tramp_iiijiji.wasm';
import t2 from '../../../../spike/wasm/tramp_vii.wasm';
import t3 from '../../../../spike/wasm/tramp_viii.wasm';
import t4 from '../../../../spike/wasm/tramp_viijiji.wasm';
import t5 from '../../../../spike/wasm/tramp_vijii.wasm';
import { buildBlob, createRunner } from '../../../../spike/core.mjs';

const fixture = buildBlob();
const unicorn = MUnicorn({
  trampolines: { iiijiji: t1, vii: t2, viii: t3, viijiji: t4, vijii: t5 },
  instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) {
    done(new WebAssembly.Instance(wasmModule, imports), wasmModule);
    return {};
  },
});
let runner: { run(payload: Uint8Array): { reachedWin: boolean; stdout: string; reason: string } } | undefined;

export async function replayPayload(payload: Uint8Array) {
  const uc = await unicorn;
  runner ??= createRunner(uc, fixture, { maxInsns: 100_000 });
  return runner.run(payload);
}
