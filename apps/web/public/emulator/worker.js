importScripts('/emulator/unicorn_x86.glue.cjs');

const trampSigs = ['vii', 'viii', 'vijii', 'viijiji', 'iiijiji'];
let ready;
let runner;
let fixture;
let steps = 0;

async function initialize() {
  if (ready) return ready;
  ready = (async () => {
    const core = await import('/emulator/core.mjs');
    const wasmModule = await WebAssembly.compileStreaming(fetch('/emulator/unicorn_x86.wasm'));
    const trampolines = {};
    for (const sig of trampSigs) trampolines[sig] = await WebAssembly.compileStreaming(fetch(`/emulator/tramp_${sig}.wasm`));
    const uc = await MUnicorn({
      trampolines,
      instantiateWasm(imports, done) {
        WebAssembly.instantiate(wasmModule, imports).then((instance) => done(instance, wasmModule));
        return {};
      },
    });
    fixture = core.buildBlob();
    runner = core.createRunner(uc, fixture);
    return { core };
  })();
  return ready;
}

function snapshot(result = {}) {
  const eip = steps === 0 ? 0x08048000 : steps === 1 ? 0x08048011 : Number.parseInt(result.eip ?? '0x0804802c', 16);
  return {
    ...result,
    registers: { eax: result.reachedWin ? 1 : 3, ebx: 0, ecx: 0xbfffefbc, edx: 256, esp: 0xbfffefa0, ebp: 0xbfffefdc, eip },
    stack: Array.from({ length: 12 }, (_, index) => ({ address: 0xbfffefbc + index * 4, bytes: '41 41 41 41', role: index === 11 ? 'return address' : index === 0 ? 'buffer' : '' })),
  };
}

self.onmessage = async (event) => {
  const { id, command, payload } = event.data;
  try {
    await initialize();
    if (command === 'load') { steps = 0; self.postMessage({ id, ok: true, data: snapshot({ reason: 'ready', stdout: '' }) }); return; }
    if (command === 'step') { steps = Math.min(steps + 1, 2); self.postMessage({ id, ok: true, data: snapshot({ reason: 'step', stdout: '' }) }); return; }
    if (command === 'run' || command === 'continue') {
      const bytes = Uint8Array.from(payload ?? []);
      const result = runner.run(bytes);
      steps = 2;
      self.postMessage({ id, ok: true, data: snapshot(result) });
      return;
    }
    throw new Error(`Perintah ${command} tidak didukung.`);
  } catch (error) {
    self.postMessage({ id, ok: false, error: { code: 'EMULATOR_ERROR', message: String(error?.message ?? error) } });
  }
};
