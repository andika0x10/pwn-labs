# Laporan Fase 0: spike emulator

Tanggal: 2026-10-31. Lingkungan: WSL Ubuntu, Node v24.20.0, wrangler 4.156.0.

## Kesimpulan

Ketiga hal yang divalidasi lolos, dengan tiga catatan yang perlu keputusan atau perhatian (bagian "Temuan").

| Pertanyaan | Hasil |
| --- | --- |
| Paket Unicorn WASM siap pakai layak? | Ya: `@alexaltea/unicorn-js@2.1.4`, varian `/x86`. Lisensi GPL-2.0. |
| Muat di batas ukuran Workers Free (3 MB gzip)? | Ya: Worker upload 876 KiB, gzip 260 KiB. |
| Replay payload dalam 10 ms CPU? | Ya, dengan optimasi (instance dipakai ulang): 1 sampai 4 ms per request warm. Tanpa optimasi: tidak (sekitar 15 ms per replay). |
| Hasil identik di tiga lingkungan? | Ya: Node, Chromium Web Worker, Cloudflare Worker (wrangler dev dan produksi workers.dev). |

## Ukuran

| Bagian | Mentah | Gzip |
| --- | --- | --- |
| `unicorn_x86.wasm` | 692,5 KB | 221,6 KB |
| Glue JS (tanpa binary inline) | 114,6 KB | 30,8 KB |
| Trampolin (5 file) | beberapa puluh byte | - |
| Worker spike total (diunggah wrangler) | 876 KiB | 260 KiB |

Sisa anggaran 3 MB gzip: sekitar 2,7 MB untuk Astro, MDX, zod, dan kode lain. Capstone tidak diperlukan di Worker (hanya browser), jadi tidak masuk anggaran ini. Capstone belum diuji di spike ini (kandidat: `capstone-wasm@1.0.3`, wasm 1,8 MB mentah).

## CPU time

Diukur di produksi (workers.dev) lewat `wrangler tail`, yang melaporkan `cpuTime` dalam ms bulat. Skrip: `spike/worker/measure.mjs`. Satu "replay" = satu run payload di emulator dari awal.

| Skenario | CPU time |
| --- | --- |
| Instance baru per replay (`runBlob`), warm | sekitar 15 ms per replay (n=10 replay ganda: 310 ms) |
| Instance baru per replay, request pertama (cold) | 83 ms |
| Instance dipakai ulang (`createRunner`), warm, 2 replay | 1 sampai 4 ms |
| Instance dipakai ulang, warm, 20 replay | 7 ms (sekitar 0,35 ms per replay) |
| Instance dipakai ulang, request cold tanpa replay | 9 ms |
| Worker Startup Time (dilaporkan wrangler) | 12 ms |

Pembanding Node (`spike/node-profile.mjs`): `new Unicorn` + `mem_map` + hook sekitar 2 ms, replay di instance yang sudah hangat 0,01 ms.

Optimasi yang dipakai di `createRunner` (semua di `spike/core.mjs`):

1. Satu instance Unicorn per isolate, dipakai ulang. State direset penuh sebelum tiap run (blob, stack nol, semua register umum).
2. Tanpa hook per instruksi. Batas instruksi lewat argumen `count` pada `emu_start`.
3. Inisialisasi WASM di global scope dengan `new WebAssembly.Instance` sinkron, jadi dihitung sebagai startup.

Catatan: request cold (isolate baru) tetap mendekati atau melewati 10 ms (9 ms untuk inisialisasi ditambah 4 ms untuk replay pertama). Selama pengujian tidak ada request yang ditolak walau beberapa memakai 217 sampai 310 ms CPU, jadi enforcement 10 ms tidak teramati. Itu bukan bukti bahwa akun ini Workers Free atau bahwa batas tidak berlaku. Konfirmasi plan akun sebelum mengandalkannya.

## Temuan yang perlu perhatian

1. **Lisensi GPL-2.0.** Unicorn dan port `@alexaltea/unicorn-js` berlisensi GPL-2.0. Mendistribusikan WASM ke browser berarti repo pwn-labs sebaiknya open source dengan lisensi yang kompatibel. Keputusan ada di pemilik proyek. Alternatif: VM x86 buatan sendiri dengan subset instruksi (lebih berat dikerjakan).
2. **Workers melarang kompilasi WASM dari bytes** ("Wasm code generation disallowed by embedder"). Dua dampaknya, keduanya sudah ditangani oleh `spike/extract-wasm.mjs`:
   - WASM utama harus di-import statis sebagai `CompiledWasm`, bukan di-inline sebagai base64 di glue.
   - Emscripten `addFunction()` (dipakai `hook_add`) mengompilasi trampolin WASM kecil saat runtime. Skrip membuat lima trampolin (`vii`, `viii`, `vijii`, `viijiji`, `iiijiji`) sebagai file `.wasm` terpisah dan mem-patch glue agar memakai `Module.trampolines[sig]`. Jika versi Unicorn.js diganti, daftar signature harus dicek ulang (skrip menurunkannya dari glue).
3. **Glue butuh tiga patch kecil** untuk workerd: `self.location?.href`, deteksi Node dimatikan (workerd mengekspos `process.versions.node`), dan binary inline dibuang. Semuanya di `extract-wasm.mjs`, dengan error jelas bila pola glue berubah.
4. **Instance baru per replay terlalu mahal** untuk Workers Free. Fase 4 harus memakai instance yang dipakai ulang dan memastikan reset state benar-benar menyeluruh (termasuk flag, segment, dan memori yang dipetakan level). Perlu tes diferensial instance baru vs dipakai ulang.

## Lingkungan

- Unicorn: `@alexaltea/unicorn-js@2.1.4` (`/x86`).
- Playwright: Chromium headless shell terpasang tanpa sudo. Empat pustaka sistem (`libnspr4`, `libnss3`, `libnssutil3`, `libasound2`) diekstrak dari paket apt ke `~/.cache/pw-libs/root`, dan dijalankan dengan `LD_LIBRARY_PATH=/home/andika/.cache/pw-libs/root/usr/lib/x86_64-linux-gnu`. Jalur resmi: `sudo npx playwright install --with-deps chromium`.
- `nasm` dan `emcc` belum terpasang. `gcc` dan `make` ada.

## Cara mengulang

```sh
cd spike/probe && npm install && cd ../..
node spike/extract-wasm.mjs         # hasilkan spike/wasm/*
node spike/node-run.mjs             # Node
LD_LIBRARY_PATH=$HOME/.cache/pw-libs/root/usr/lib/x86_64-linux-gnu node spike/browser/run.mjs   # Web Worker
cd spike/worker && npx wrangler dev # Worker lokal, buka /?n=1&mode=fast
node measure.mjs https://pwn-labs-spike.<subdomain>.workers.dev "/?n=1&mode=fast"
```

## Sumber daya Cloudflare yang dibuat

- Worker `pwn-labs-spike` (workers.dev), dibuat dengan `npx wrangler deploy` dari `spike/worker`. Hanya untuk pengukuran. Penghapusan butuh konfirmasi user.
