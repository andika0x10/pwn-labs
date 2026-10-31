// Web Worker klasik: glue Emscripten lewat importScripts, inti spike lewat dynamic import.
importScripts("../wasm/unicorn_x86.glue.cjs");

const trampSigs = ["vii", "viii", "vijii", "viijiji", "iiijiji"];

self.onmessage = async () => {
  try {
    const { buildBlob, buildPayload, runBlob } = await import("../core.mjs");
    const wasmModule = await WebAssembly.compileStreaming(fetch("../wasm/unicorn_x86.wasm"));
    // Browser mengizinkan kompilasi runtime, tetapi pakai jalur yang sama dengan Worker agar identik.
    const trampolines = {};
    for (const sig of trampSigs) {
      trampolines[sig] = await WebAssembly.compileStreaming(fetch(`../wasm/tramp_${sig}.wasm`));
    }
    const uc = await MUnicorn({
      trampolines,
      instantiateWasm(imports, done) {
        WebAssembly.instantiate(wasmModule, imports).then((inst) => done(inst, wasmModule));
        return {};
      },
    });
    const fixture = buildBlob();
    const good = runBlob(uc, fixture, buildPayload(fixture.symbols.win));
    const bad = runBlob(uc, fixture, new Uint8Array(8).fill(0x41));
    self.postMessage({ env: "browser-web-worker", good, bad });
  } catch (e) {
    self.postMessage({ error: String(e?.stack ?? e) });
  }
};
