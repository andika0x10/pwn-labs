# Menulis world dan level

Konten pwn-labs disimpan di git. Solution tidak dikirim ke browser; flag hanya dikirim sesudah verifikasi server berhasil.

## Membuat world

```sh
npm run new:world -- latihan
```

Isi `apps/web/src/content/worlds/latihan/world.json`, lalu ubah `draft` menjadi `false` ketika world siap ditampilkan. World `stack` sudah berisi lima soal terbit.

## Membuat level

```sh
npm run new:level -- latihan pertama
```

Perintah membuat MDX level dan source challenge di `challenges/src/latihan-pertama`. Lengkapi materi, konfigurasi frontmatter, source assembly, representasi C, tiga hint, `solution.payload`, dan `negative.json` (array ekspresi payload salah). Level baru selalu `draft: true`; build dan tes level melewati draft.

Frontmatter penting:

- `id`, `world`, dan `order` menentukan identitas serta posisi level.
- `points` harus integer positif.
- Runtime dan build soal terbit saat ini memakai `arch: x86-32`. Dukungan x86-64 belum diterapkan.
- `binary` menunjuk blob raw di `/public/binaries`.
- `success` memakai `eip-reaches` atau `output-contains`.
- `requires` hanya boleh menunjuk ID level yang ada.
- `draft` menyembunyikan level di produksi; soal nyata memakai `example: false`.

## Payload

Sintaks yang didukung: string dan bytes literal, `+`, `*`, `p32`, `p64`, `cyclic`, `cyclic_find`, `nop`, dan argumen angka desimal/heksadesimal. Parser tidak memakai `eval`; hasil maksimal 4 KiB. Simbol bytes tambahan harus disediakan pemanggil; workspace saat ini tidak menyediakan simbol `shellcode`.

```text
"A" * 32 + p32(0x11223344)
cyclic(100)
b"\x90" * 16
```

## Build dan validasi

```sh
npm run build:challenges
npm run validate:content
npm run test:levels
npm test
```

Build memakai GCC (`-m32 -c`) dan GNU binutils (`ld`, `objcopy`, `nm`), tanpa libc 32-bit, NASM, atau sudo. `challenge.S` adalah sumber sebenarnya; `challenge.c` hanya representasi konsep dan wajib diberi label demikian. Semua kode dan data konstan ditempatkan di section `.text` oleh `challenges/link.ld`. Build menghasilkan blob, simbol frontmatter, source publik C/assembly, serta `challenges/manifest.json`. Hasil build di-commit agar menjalankan situs tidak membutuhkan compiler.

Runtime memetakan kode read-only/executable dan stack read/write. Syscall `read` hanya boleh menulis ke stack. Kode dimuat sekali per runner; stack, register, dan output direset sebelum setiap run. `apps/web/src/worker.ts` menyiapkan WASM dan runner saat startup Worker agar import lazy endpoint Astro tidak membebani CPU request submit.

Dalam solution dan kasus negatif, placeholder seperti `{{win}}` atau `{{target}}` diganti alamat simbol hasil build sebelum ekspresi diparse. Contoh privat: `"A" * 32 + p32({{win}})`. Placeholder tidak berlaku di editor pemain. Jangan menaruh solution di manifest atau direktori publik.

`cyclic_find(angka EIP)` menghasilkan empat byte offset little-endian pada pratinjau payload, bukan ekspresi angka yang dapat disarangkan dalam `p32`. Nilai yang tidak ada dalam pola menghasilkan error.

Setiap hint mengurangi 10% poin dasar, dengan batas minimum 50%. Kelima soal Stack memiliki tiga hint. Hint tamu tidak dicatat; hint akun yang masuk dicatat oleh server.

## Checklist terbit

1. ID, urutan, prerequisite, poin, dan symbol sudah benar.
2. Binary dibangun ulang dan solution test lolos.
3. Materi menjelaskan tujuan tanpa membocorkan solution.
4. Hint dibuka dari umum ke spesifik.
5. `draft` diubah menjadi `false` dan level diuji di mobile serta desktop.
6. Pastikan tidak ada flag, secret, atau solution payload di aset publik.

## Rilis

Durable Object harus terbit sebelum web. Untuk perubahan skema, terapkan migrasi yang diperlukan sebelum web. Khusus migrasi penghapusan skor contoh, terbitkan web baru lebih dahulu, lalu jalankan smoke test yang menerapkan migrasi data dan membangun ulang cache leaderboard:

```sh
npm run deploy:staging
node scripts/release-smoke.mjs staging --remove-examples --measure
npm run deploy -w workers/do
npm run deploy
node scripts/release-smoke.mjs production --remove-examples --measure
```

Astro memilih environment Cloudflare saat build. Karena itu staging wajib memakai `CLOUDFLARE_ENV=staging`; flag `wrangler deploy --env staging` setelah build tidak cukup. Secret `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, dan `FLAG_SECRET` dipasang melalui Wrangler dan tidak disimpan di git.

Callback OAuth:

- staging: `https://pwn-labs-staging.andikadinata.workers.dev/auth/github/callback`
- produksi: `https://pwn-labs.andikadinata.workers.dev/auth/github/callback`

Setelah deploy, cek landing, lima soal Stack, submit, leaderboard, profil, logout, serta fallback polling. Jika build menampilkan binding produksi ketika menargetkan staging, hapus artifact `dist`, build ulang dengan `CLOUDFLARE_ENV=staging`, dan periksa `dist/server/wrangler.json` sebelum deploy.

Smoke test memakai akun dan sesi sementara, menguji locking, payload salah/benar, hint, poin, submit ulang, leaderboard WebSocket dan HTTP, profil, serta logout. Akun uji dihapus melalui API dan cache leaderboard dibangun ulang dari D1. Token sesi tidak dicetak. Backup baris contoh dan laporan tersimpan lokal di `.wrangler/stack-release/` (diabaikan git). Opsi `--measure` memeriksa minimal sepuluh sampel CPU request submit melalui Wrangler Tail, mencakup payload benar dan salah setiap level; semua sampel yang tercatat harus memenuhi batas 10 ms. Jika Tail melewatkan event, skrip mengulang replay hanya untuk level yang belum lengkap, dengan menghapus progress milik akun uji sendiri sebelum pengukuran ulang. Produksi hanya boleh dilanjutkan sesudah staging lolos.
