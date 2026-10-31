// Profil bagian-bagian biaya satu replay (Node, CPU time).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { buildBlob, buildPayload, runBlob, BASE, STACK_TOP, STACK_SIZE } from "./core.mjs";

const require = createRequire(import.meta.url);
const MUnicorn = require("./wasm/unicorn_x86.glue.cjs");
const wasmModule = await WebAssembly.compile(readFileSync(new URL("./wasm/unicorn_x86.wasm", import.meta.url)));
const trampolines = {};
for (const sig of ["vii", "viii", "vijii", "viijiji", "iiijiji"]) {
  trampolines[sig] = new WebAssembly.Module(readFileSync(new URL(`./wasm/tramp_${sig}.wasm`, import.meta.url)));
}
const uc = await MUnicorn({
  trampolines,
  instantiateWasm(imports, done) {
    WebAssembly.instantiate(wasmModule, imports).then((inst) => done(inst, wasmModule));
    return {};
  },
});

const ms = (a) => {
  const b = process.cpuUsage(a);
  return (b.user + b.system) / 1000;
};
const med = (f, n = 100) => {
  const xs = [];
  for (let i = 0; i < n; i++) xs.push(f());
  xs.sort((a, b) => a - b);
  return xs[n >> 1];
};

const b = buildBlob();
const payload = buildPayload(b.symbols.win);
console.log("runBlob completo      :", med(() => { const t = process.cpuUsage(); runBlob(uc, b, payload); return ms(t); }).toFixed(2), "ms");
console.log("new Unicorn + close   :", med(() => { const t = process.cpuUsage(); new uc.Unicorn(uc.ARCH_X86, uc.MODE_32).close(); return ms(t); }).toFixed(2), "ms");
console.log("+ mem_map 4K + 64K    :", med(() => {
  const t = process.cpuUsage();
  const e = new uc.Unicorn(uc.ARCH_X86, uc.MODE_32);
  e.mem_map(BASE, 0x1000, uc.PROT_ALL);
  e.mem_map(STACK_TOP - STACK_SIZE, STACK_SIZE, uc.PROT_ALL);
  e.close();
  return ms(t);
}).toFixed(2), "ms");
console.log("+ hook_add x2         :", med(() => {
  const t = process.cpuUsage();
  const e = new uc.Unicorn(uc.ARCH_X86, uc.MODE_32);
  e.hook_add(uc.HOOK_CODE, () => {}, 0, 1, 0);
  e.hook_add(uc.HOOK_INTR, () => {}, 0, 1, 0);
  e.close();
  return ms(t);
}).toFixed(2), "ms");

// Satu instance dipakai ulang: hanya reset memori/register + emu_start.
const e = new uc.Unicorn(uc.ARCH_X86, uc.MODE_32);
e.mem_map(BASE, 0x1000, uc.PROT_ALL);
e.mem_map(STACK_TOP - STACK_SIZE, STACK_SIZE, uc.PROT_ALL);
let pos = 0;
let won = false;
e.hook_add(uc.HOOK_INTR, () => {
  const eax = e.reg_read_i32(uc.X86_REG_EAX) >>> 0;
  const ecx = e.reg_read_i32(uc.X86_REG_ECX) >>> 0;
  const edx = e.reg_read_i32(uc.X86_REG_EDX) >>> 0;
  if (eax === 3) { e.mem_write(ecx, payload.subarray(pos, pos + edx)); pos += edx; e.reg_write_i32(uc.X86_REG_EAX, edx); }
  else if (eax === 4) { won = true; e.reg_write_i32(uc.X86_REG_EAX, edx); }
  else e.emu_stop();
}, 0, 1, 0);
console.log("instance dipakai ulang:", med(() => {
  const t = process.cpuUsage();
  pos = 0; won = false;
  e.mem_write(BASE, b.blob);
  e.reg_write_i32(uc.X86_REG_ESP, STACK_TOP - 0x100);
  e.emu_start(BASE, BASE + b.blob.length, 0, 0);
  const d = ms(t);
  if (!won) throw new Error("gagal");
  return d;
}).toFixed(2), "ms");
