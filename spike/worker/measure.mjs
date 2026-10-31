// Ukur CPU time di produksi (workers.dev) lewat `wrangler tail`. Pakai: node measure.mjs <base-url> <path...>
import { spawn } from "node:child_process";

const [base, ...paths] = process.argv.slice(2);
const tail = spawn("npx", ["wrangler", "tail", "pwn-labs-spike", "--format", "json"], { stdio: ["ignore", "pipe", "pipe"] });
let buf = "";
tail.stdout.on("data", (d) => (buf += d));
await new Promise((r) => setTimeout(r, 9000));
for (const p of paths) {
  const t = performance.now();
  const res = await fetch(base + p);
  await res.text();
  console.log("request", p, res.status, `${(performance.now() - t).toFixed(0)}ms`);
  await new Promise((r) => setTimeout(r, 1500));
}
await new Promise((r) => setTimeout(r, 4000));
tail.kill();
for (const part of buf.split(/\n(?=\{\n)/)) {
  try {
    const j = JSON.parse(part);
    console.log(j.outcome, "cpu", j.cpuTime, "ms wall", j.wallTime, "ms", j.event.request.url.split("workers.dev")[1]);
  } catch {}
}
