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

## Keputusan

- Fase 0: emulator memakai `@alexaltea/unicorn-js` varian x86 (GPL-2.0), dengan glue yang di-patch oleh skrip ekstraksi dan trampolin WASM statis. Detail dan angka di `spike/REPORT.md`.
- Lisensi: repo open source (dikonfirmasi user), sehingga GPL-2.0 Unicorn dapat diterima. Pilih lisensi kompatibel (GPL-2.0-or-later atau GPL-3.0) sebelum rilis.
- Plan: Workers Free (dikonfirmasi user). Batas 10 ms CPU berlaku, jadi desain replay Fase 4 harus hemat.
- Fase 0: replay di Worker wajib memakai instance Unicorn yang dipakai ulang, tanpa hook per instruksi, dan inisialisasi di global scope.
