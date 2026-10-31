// Jalankan spike di Chromium headless (Web Worker) dan bandingkan dengan hasil Node dan Worker lokal.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("../probe/node_modules/playwright-core");

const root = new URL("..", import.meta.url).pathname;
const types = { ".js": "text/javascript", ".mjs": "text/javascript", ".cjs": "text/javascript", ".wasm": "application/wasm", ".html": "text/html" };
const server = createServer(async (req, res) => {
  try {
    const path = normalize(join(root, new URL(req.url, "http://x").pathname));
    if (!path.startsWith(root)) throw new Error("outside");
    const body = await readFile(path);
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/browser/index.html`);
const result = await page.evaluate(() => window.__result);
await browser.close();
server.close();
console.log(JSON.stringify(result));
