## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Lingkungan

- Pengembangan di WSL Ubuntu, repo di `~/projects/pwn-labs` (filesystem WSL). Node v24.20.0 dari nvm (`which node` menunjuk `~/.nvm`).
- Wrangler sudah login di WSL (`npx wrangler whoami`). Jangan menjalankan `wrangler login`.
- Tanpa sudo. Chromium untuk Playwright dijalankan dengan pustaka yang diekstrak ke `~/.cache/pw-libs/root` (lihat `spike/REPORT.md`).
- Belum terpasang: `nasm`, `emcc`. Ada: `gcc`, `make`.

## Infrastruktur

| Resource | Nama | Dibuat dengan | Catatan |
| --- | --- | --- | --- |
| Worker (spike Fase 0) | `pwn-labs-spike` | `npx wrangler deploy` di `spike/worker` | Dihapus 2026-10-31 atas persetujuan user (`npx wrangler delete --name pwn-labs-spike --force`). |
| Worker web (staging) | `pwn-labs-staging` | `CLOUDFLARE_ENV=staging npm run build` lalu `wrangler deploy` di `apps/web` | `https://pwn-labs-staging.andikadinata.workers.dev` |
| Worker DO (staging) | `pwn-labs-do-staging` | `wrangler deploy --env staging` di `workers/do` | Durable Object `LevelSession` dan `Leaderboard`. |
| D1 (staging) | `pwn-labs-db-staging` (`89e386cd-b644-43f1-8aba-436c35a06dd9`) | `npx wrangler d1 create pwn-labs-db-staging` | Database terpisah untuk smoke test staging. |
| Worker web (produksi) | `pwn-labs` | `npm run build` lalu `wrangler deploy` di `apps/web` | `https://pwn-labs.andikadinata.workers.dev` |
| Worker DO (produksi) | `pwn-labs-do` | `wrangler deploy` di `workers/do` | Durable Object `LevelSession` dan `Leaderboard`. |
| D1 (produksi) | `pwn-labs-db` (`8c940c23-2970-40a3-95d6-b46b5860ac67`) | Sudah tersedia sebelum Fase 3 | Database produksi. |

## Keputusan

- Fase 0: emulator memakai `@alexaltea/unicorn-js` varian x86 (GPL-2.0), dengan glue yang di-patch oleh skrip ekstraksi dan trampolin WASM statis. Detail dan angka di `spike/REPORT.md`.
- Lisensi: repo open source (dikonfirmasi user), sehingga GPL-2.0 Unicorn dapat diterima. Pilih lisensi kompatibel (GPL-2.0-or-later atau GPL-3.0) sebelum rilis.
- Plan: Workers Free (dikonfirmasi user). Batas 10 ms CPU berlaku, jadi desain replay Fase 4 harus hemat.
- Fase 0: replay di Worker wajib memakai instance Unicorn yang dipakai ulang, tanpa hook per instruksi, dan inisialisasi di global scope.
- Fase 1: Astro dipindah ke `apps/web` (npm workspaces: `apps/*`, `packages/*`, `workers/*`). Jalankan perintah dari root (`npm run dev`, `build`, `check`).
- Fase 1: variabel font di token dinamai `--font-family-sans` dan `--font-family-mono` (bukan `--font-sans`/`--font-mono`), karena `--font-sans: var(--font-sans)` di `@theme inline` menjadi referensi melingkar. Pemetaan Tailwind tetap `font-sans` dan `font-mono`.
- Fase 1: warna kode memakai shiki `css-variables`, diturunkan dari token di `tokens.css`.
- Fase 1: `/play` dan `/leaderboard` masih halaman stub statis. Tombol login dan avatar di header ditambahkan di Fase 3, saat `/auth/github` ada.
- Fase 1: adapter Cloudflare menyebut binding `IMAGES` dan `SESSION` (KV) saat build, belum dideklarasikan di `wrangler.jsonc`. Putuskan di Fase 3 (sesi memakai D1, jadi kemungkinan dimatikan agar tidak membuat KV).
- Fase 1: Lighthouse (a11y, best-practices, SEO) 100 di `/`, `/docs`, `/docs/memulai`, `/play`, `/leaderboard`, dan `/404` pada build produksi (`spike/probe/lh-all.mjs`, Chromium headless).
- Shell terminal agent memakan backtick dan tanda dolar di heredoc. Tulis file yang memuatnya lewat `write_file` atau `edit_file`.
- Stack Dasar (2026-11-02): user meminta soal nyata dan mengizinkan penghapusan progress/submission `example-01` dan `example-02`, serta deploy staging lalu produksi. World `stack` berisi overwrite, magic, offset, ret2win, dan arguments; poin 100/150/200/250/300, prasyarat berurutan, tiga hint per soal.
- Challenge dibangun dari assembly GNU `challenge.S` dengan GCC/binutils tanpa libc 32-bit atau NASM. C hanya representasi konsep. `challenges/manifest.json`, simbol frontmatter, blob, dan source publik merupakan hasil build yang di-commit; solution dan kasus negatif tetap di `challenges/src`.
- Runtime produksi bersama ada di `packages/emulator-core/core.mjs`; browser memuat binary/config per level, server memilih dari konten tepercaya dan memakai runner reusable per level. Snapshot stack/register aktual, dengan pembacaan stack maksimal 256 byte; server tidak membuat snapshot memori rinci.
- Emulator server wajib di-import eager dari entrypoint `apps/web/src/worker.ts` (main Wrangler), lalu tunggu `replayReady` saat startup. Import melalui endpoint Astro saja ternyata lazy dan membebankan inisialisasi ke CPU request. Runner dipanaskan saat startup; kode RX dimuat sekali, syscall read dibatasi ke stack RW, sehingga reset tidak perlu menulis ulang kode atau membuang cache translasi.
- `cyclic_find(angka)` menghasilkan empat byte offset little-endian untuk pratinjau payload; bukan ekspresi numerik bersarang. Nilai yang tidak ditemukan menjadi error.
- `npm run test:e2e` menyalakan/memakai ulang `astro dev --background` lewat `scripts/e2e.mjs`; Playwright tidak mengelola proses dev foreground. Dengan `PLAYWRIGHT_BASE_URL`, tes langsung memakai URL tersebut.
- Penghapusan skor contoh memakai migrasi `0002_remove_example_scores.sql` setelah deploy web baru. `scripts/release-smoke.mjs` menyimpan backup lokal di `.wrangler/stack-release`, menguji akun sementara, lalu menghapusnya melalui API yang juga membangun ulang cache leaderboard dari D1. Pengujian lokal memakai SQLite langsung agar tidak berebut lock Miniflare dengan server background.
- Rilis Stack Dasar terverifikasi 2026-11-02: 22 E2E lulus pada lokal/staging/produksi; CPU request submit staging 2–7 ms (11 sampel), produksi 2–5 ms (12 sampel), mencakup payload benar/salah setiap level. Tail memakai header akun uji untuk korelasi dan dapat memerlukan replay tambahan saat event terlewat. Detail versi, migrasi, dan pengujian di `docs/releases/stack-dasar.md`. Kedua lingkungan tidak menyisakan akun uji atau progress/submission contoh.
