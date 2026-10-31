import MUnicorn from "../../wasm/unicorn_x86.glue.cjs";
import wasmModule from "../../wasm/unicorn_x86.wasm";
import t1 from "../../wasm/tramp_iiijiji.wasm";
import t2 from "../../wasm/tramp_vii.wasm";
import t3 from "../../wasm/tramp_viii.wasm";
import t4 from "../../wasm/tramp_viijiji.wasm";
import t5 from "../../wasm/tramp_vijii.wasm";
import { buildBlob, buildPayload, runBlob, createRunner } from "../../core.mjs";

const trampolines = { iiijiji: t1, vii: t2, viii: t3, viijiji: t4, vijii: t5 };

const fixture = buildBlob();

// Dijalankan di global scope (dihitung sebagai startup, bukan CPU time request).
// Instansiasi sinkron karena I/O async tidak diizinkan di global scope.
const ucPromise = MUnicorn({
  trampolines,
  // Workers melarang kompilasi dari bytes; pakai module hasil import statis.
  instantiateWasm(imports, done) {
    done(new WebAssembly.Instance(wasmModule, imports), wasmModule);
    return {};
  },
});
let runner;
const getUc = () => ucPromise;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const uc = await getUc();
    const n = Math.min(Number(url.searchParams.get("n") ?? 1), 200);
    const winPayload = buildPayload(fixture.symbols.win);
    const badPayload = new Uint8Array(8).fill(0x41);
    const fast = url.searchParams.get("mode") === "fast";
    let good;
    let bad;
    if (fast) {
      runner ??= createRunner(uc, fixture);
      for (let i = 0; i < n; i++) {
        good = runner.run(winPayload);
        bad = runner.run(badPayload);
      }
    } else {
      for (let i = 0; i < n; i++) {
        good = runBlob(uc, fixture, winPayload);
        bad = runBlob(uc, fixture, badPayload);
      }
    }
    return Response.json({ env: "cloudflare-worker", mode: fast ? "fast" : "full", good, bad });
  },
};
