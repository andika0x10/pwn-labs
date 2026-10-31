// Cek paket npm kandidat untuk Unicorn/Capstone WASM.
const names = [
  "unicorn-wasm",
  "unicorn-engine",
  "unicorn-engine-wasm",
  "unicorn.js",
  "unicornjs",
  "@alexaltea/unicorn-js",
  "@alexaltea/unicorn.js",
  "@unicorn-engine/unicorn",
  "@kernelforge/ntsim-unicorn",
  "@kreijstal/capstone-wasm",
  "capstone-wasm",
  "@alexaltea/capstone-js",
  "capstone-engine",
  "@unicorn-engine/unicorn-wasm",
];
for (const n of names) {
  const r = await fetch(`https://registry.npmjs.org/${n.replace("/", "%2F")}`);
  if (!r.ok) {
    console.log(n, "->", r.status);
    continue;
  }
  const j = await r.json();
  const v = j["dist-tags"].latest;
  const d = j.versions[v];
  console.log(n, v, "unpacked:", d.dist.unpackedSize, "|", (d.description || "").slice(0, 90));
}
