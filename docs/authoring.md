# Menulis world dan level

Konten pwn-labs disimpan di git. Flag dan solution tidak pernah dikirim ke browser.

## Membuat world

```sh
npm run new:world -- stack
```

Isi `apps/web/src/content/worlds/stack/world.json`, lalu ubah `draft` menjadi `false` ketika world siap ditampilkan.

## Membuat level

```sh
npm run new:level -- stack ret2win
```

Perintah membuat MDX level dan source challenge di `challenges/src/stack-ret2win`. Lengkapi materi, metadata emulator, symbol, kondisi sukses, hint, dan solution payload. Level baru selalu `draft: true`.

Frontmatter penting:

- `id`, `world`, dan `order` menentukan identitas serta posisi level.
- `points` harus integer positif.
- `arch` mendukung `x86-32` atau `x86-64`.
- `binary` menunjuk blob raw di `/public/binaries`.
- `success` memakai `eip-reaches` atau `output-contains`.
- `requires` hanya boleh menunjuk ID level yang ada.
- `draft` menyembunyikan level di produksi; `example` menandai fixture platform.

## Payload

Sintaks yang didukung: string dan bytes literal, `+`, `*`, `p32`, `p64`, `cyclic`, `cyclic_find`, `nop`, literal hex, dan simbol `shellcode`. Parser tidak memakai `eval`; hasil maksimal 4 KiB.

```text
"A" * 68 + p32(0x0804802d)
cyclic(100)
b"\x90" * 16 + shellcode
```

## Build dan validasi

```sh
npm run build:challenges
npm run validate:content
npm run test:levels
npm test
```

GCC dan `make` cukup untuk fixture saat ini. Template `.asm` membutuhkan NASM. Jika toolchain belum ada, build harus berhenti dengan nama program yang kurang; binary hasil build tetap di-commit agar CI dan pembaca tidak membutuhkan compiler.

## Checklist terbit

1. ID, urutan, prerequisite, poin, dan symbol sudah benar.
2. Binary dibangun ulang dan solution test lolos.
3. Materi menjelaskan tujuan tanpa membocorkan solution.
4. Hint dibuka dari umum ke spesifik.
5. `draft` diubah menjadi `false` dan level diuji di mobile serta desktop.
6. Pastikan tidak ada flag, secret, atau solution payload di aset publik.

## Rilis

Durable Object harus terbit sebelum web. Terapkan migrasi D1 untuk target yang sama, lalu jalankan:

```sh
npm run deploy:staging
npm run deploy -w workers/do
npm run deploy
```

Astro memilih environment Cloudflare saat build. Karena itu staging wajib memakai `CLOUDFLARE_ENV=staging`; flag `wrangler deploy --env staging` setelah build tidak cukup. Secret `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, dan `FLAG_SECRET` dipasang melalui Wrangler dan tidak disimpan di git.

Callback OAuth:

- staging: `https://pwn-labs-staging.andikadinata.workers.dev/auth/github/callback`
- produksi: `https://pwn-labs.andikadinata.workers.dev/auth/github/callback`

Setelah deploy, cek landing, dua level contoh, submit, leaderboard, profil, logout, serta fallback polling. Jika build menampilkan binding produksi ketika menargetkan staging, hapus artifact `dist`, build ulang dengan `CLOUDFLARE_ENV=staging`, dan periksa `dist/server/wrangler.json` sebelum deploy.
