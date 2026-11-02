importScripts('/emulator/unicorn_x86.glue.cjs');

const signatures = ['vii', 'viii', 'vijii', 'viijiji', 'iiijiji'];
let ready;
let runner;
async function initialize() {
  ready ??= (async () => {
    const core = await import('/emulator/core.mjs');
    const wasmModule = await WebAssembly.compileStreaming(fetch('/emulator/unicorn_x86.wasm'));
    const trampolines = {};
    for (const signature of signatures) trampolines[signature] = await WebAssembly.compileStreaming(fetch('/emulator/tramp_' + signature + '.wasm'));
    const uc = await MUnicorn({
      trampolines,
      instantiateWasm(imports, done) {
        WebAssembly.instantiate(wasmModule, imports).then((instance) => done(instance, wasmModule));
        return {};
      },
    });
    return { core, uc };
  })();
  return ready;
}
self.onmessage = async ({ data: { id, command, payload, challenge } }) => {
  try {
    const { core, uc } = await initialize();
    if (command === 'load') {
      if (!challenge || challenge.arch !== 'x86-32') throw new Error('Konfigurasi challenge tidak didukung.');
      const response = await fetch(challenge.binary);
      if (!response.ok) throw new Error('Binary tidak tersedia.');
      const blob = new Uint8Array(await response.arrayBuffer());
      if (!blob.length || blob.length > 4096) throw new Error('Ukuran binary tidak valid.');
      runner?.close();
      runner = core.createRunner(uc, { ...challenge, blob });
      self.postMessage({ id, ok: true, data: runner.initial() });
      return;
    }
    if (!runner) throw new Error('Muat challenge sebelum menjalankan payload.');
    if (command !== 'run') throw new Error('Perintah tidak didukung: ' + command);
    self.postMessage({ id, ok: true, data: runner.run(Uint8Array.from(payload ?? [])) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: { code: 'EMULATOR_ERROR', message: String(error?.message ?? error) } });
  }
};
