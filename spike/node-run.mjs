import { createRequire } from "node:module";
import { buildBlob, buildPayload, runBlob } from "./core.mjs";

const require = createRequire(import.meta.url);
const MUnicorn = require("./probe/node_modules/@alexaltea/unicorn-js/dist/unicorn_x86.js");
const uc = await MUnicorn();
const b = buildBlob();
console.log("blob bytes:", b.blob.length, b.symbols);
const good = runBlob(uc, b, buildPayload(b.symbols.win));
const bad = runBlob(uc, b, new Uint8Array(8).fill(0x41));
console.log("good", JSON.stringify(good));
console.log("bad ", JSON.stringify(bad));
