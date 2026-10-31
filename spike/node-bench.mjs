// Ukur CPU time (process.cpuUsage) untuk init dan replay di Node, memakai glue/wasm yang sama dengan Worker.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { buildBlob, buildPayload, runBlob } from "./core.mjs";

const require = createRequire(import.meta.url);
const MUnicorn = require("./wasm/unicorn_x86.glue.cjs");
const wasmBytes = readFileSync(new URL("./wasm/unicorn_x86.wasm", import.meta.url));
const trampolines = {};
for (const sig of ["vii", "viii", "vijii", "viijiji", "iiijiji"]) {
  trampolines[sig] = new WebAssembly.Module(readFileSync(new URL(`./wasm/tramp_${sig}.wasm`, import.meta.url)));
}

const cpuMs = (a, b) => ((b.user - a.user) + (b.system - a.system)) / 1000;
const t0 = process.cpuUsage();
const wasmModule = await WebAssembly.compile(wasmBytes);
const t1 = process.cpuUsage();
const uc = await MUnicorn({
  trampolines,
  instantiateWasm(imports, done) {
    WebAssembly.instantiate(wasmModule, imports).then((inst) => done(inst, wasmModule));
    return {};
  },
});
const t2 = process.cpuUsage();
console.log(`compile wasm : ${cpuMs(t0, t1).toFixed(1)} ms CPU`);
console.log(`instansiasi  : ${cpuMs(t1, t2).toFixed(1)} ms CPU`);

const b = buildBlob();
const payload = buildPayload(b.symbols.win);
const samples = [];
for (let i = 0; i < 200; i++) {
  const a = process.cpuUsage();
  const r = runBlob(uc, b, payload);
  samples.push(cpuMs(a, process.cpuUsage()));
  if (!r.reachedWin) throw new Error("replay gagal");
}
const sorted = [...samples].sort((x, y) => x - y);
console.log(`replay #1    : ${samples[0].toFixed(2)} ms CPU (cold)`);
console.log(`replay median: ${sorted[100].toFixed(2)} ms, p95 ${sorted[190].toFixed(2)} ms, max ${sorted[199].toFixed(2)} ms`);
