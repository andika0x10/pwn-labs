// Ekstrak WASM yang di-inline di glue @alexaltea/unicorn-js (x86 only) dan buat glue tanpa binary inline.
// Alasan: Workers melarang kompilasi WASM dari bytes saat runtime; module harus di-import statis.
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const gluePath = require.resolve("@alexaltea/unicorn-js/x86", { paths: ["./spike/probe"] });
const src = readFileSync(gluePath, "utf8");

// Tangkap bytes lewat hook instantiateWasm.
const MUnicorn = require(gluePath);
let captured;
const origInst = WebAssembly.instantiate;
WebAssembly.instantiate = (b, i) => {
  if (b instanceof Uint8Array || b instanceof ArrayBuffer) captured = new Uint8Array(b);
  return origInst.call(WebAssembly, b, i);
};
const uc = await MUnicorn();
WebAssembly.instantiate = origInst;
if (!captured) throw new Error("wasm tidak tertangkap");

mkdirSync("spike/wasm", { recursive: true });
writeFileSync("spike/wasm/unicorn_x86.wasm", captured);

// Glue tanpa literal binary: ganti argumen binaryDecode('...') dengan string kosong.
const i = src.indexOf("binaryDecode('");
if (i < 0) throw new Error("literal binaryDecode tidak ditemukan");
// Pindai akhir string literal dengan memperhatikan escape backslash.
let j = i + 14;
while (src[j] !== "'") j += src[j] === "\\" ? 2 : 1;
// workerd punya WorkerGlobalScope tapi tanpa self.location; netralkan akses itu.
// Dan workerd mengekspos `process.versions.node` sehingga glue salah mendeteksi Node.
const NODE_DETECT = 'var ENVIRONMENT_IS_NODE=globalThis.process?.versions?.node&&globalThis.process?.type!="renderer"';
if (!src.includes(NODE_DETECT)) throw new Error("pola deteksi Node berubah");
// Dan Emscripten addFunction() mengompilasi trampolin WASM dari bytes (dilarang di Workers):
// pakai module yang sudah dikompilasi sebelumnya lewat Module.trampolines[sig].
const TRAMP = "var module=new WebAssembly.Module(bytes);";
if (!src.includes(TRAMP)) throw new Error("pola trampolin berubah");
const stripped = (src.slice(0, i) + "binaryDecode('" + src.slice(j))
  .replace("_scriptName=self.location.href", "_scriptName=self.location?.href")
  .replace(NODE_DETECT, "var ENVIRONMENT_IS_NODE=false")
  .replace(TRAMP, 'var module=Module["trampolines"]&&Module["trampolines"][sig]||new WebAssembly.Module(bytes);');

// Bangun trampolin untuk setiap signature yang dipakai glue (cocokkan logika convertJsFunctionToWasm).
const codes = { i: 127, j: 126, f: 125, d: 124 };
const pack = (types) => {
  const a = Array.from(types, (t) => codes[t]);
  return [a.length % 128 | 128, a.length >> 7, ...a];
};
const sigs = [...new Set([...src.matchAll(/addFunction\(callback,"([a-z]+)"\)/g)].map((m) => m[1]))];
for (const sig of sigs) {
  const typeSec = [1, 96, ...pack(sig.slice(1)), ...pack(sig[0] === "v" ? "" : sig[0])];
  const bytes = Uint8Array.of(
    0, 97, 115, 109, 1, 0, 0, 0, 1,
    typeSec.length % 128 | 128, typeSec.length >> 7, ...typeSec,
    2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0,
  );
  writeFileSync(`spike/wasm/tramp_${sig}.wasm`, bytes);
}
console.log("trampolin:", sigs.join(", "));
writeFileSync("spike/wasm/unicorn_x86.glue.cjs", stripped);

const kb = (n) => (n / 1024).toFixed(1) + " KB";
console.log("wasm       :", kb(captured.length), "gzip", kb(gzipSync(captured).length));
console.log("glue asli  :", kb(src.length), "gzip", kb(gzipSync(Buffer.from(src)).length));
console.log("glue strip :", kb(stripped.length), "gzip", kb(gzipSync(Buffer.from(stripped)).length));
void uc;
