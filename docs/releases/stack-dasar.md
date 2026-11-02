# Rilis Stack Dasar — 2026-11-02

Lima soal x86-32 berbahasa Indonesia menggantikan world contoh. Produksi: [Stack Dasar](https://pwn-labs.andikadinata.workers.dev/play/stack). Staging: [Stack Dasar staging](https://pwn-labs-staging.andikadinata.workers.dev/play/stack).

## Verifikasi

- Build challenge GNU, validasi konten/aset/simbol, tes solution dan kasus negatif, serta perbandingan runner baru dan reusable lulus.
- Unit test: 10 lulus. Lint, typecheck (46 file; tanpa error/peringatan), dan build produksi lulus.
- Playwright: 22 tes lulus pada lokal, staging, dan produksi; mencakup kelima soal pada desktop/HP, keyboard, payload draft, submit, dan penghapusan rute/aset contoh.
- Register, stack, output, dan kondisi sukses browser identik dengan runtime Node, termasuk perpindahan level dua arah.
- Akun sementara menguji locking SSR/API, payload salah/benar, poin setelah membuka hint, submit ulang, leaderboard HTTP/WebSocket, profil, dan logout. Lima solve dengan satu hint menghasilkan 990 poin; submit ulang tidak menggandakan poin. OAuth diperiksa sampai redirect/PKCE; pertukaran kode GitHub langsung tidak diulang.
- Scaffold world dan level GNU diperiksa dalam direktori sementara. Tidak ada compiler atau dependensi eksternal baru yang dipasang.

## CPU submit Cloudflare

Angka berikut adalah cpuTime request submit dari Wrangler Tail, bukan wall time atau timer JavaScript. Setiap level mencakup payload benar dan salah. Semua sampel yang tertangkap lolos batas proyek 10 ms: staging 11 sampel (2–7 ms), produksi 12 sampel (2–5 ms). Tail yang melewatkan event ditangani dengan replay tambahan pada akun uji sendiri; respons submit idempoten tidak dihitung sebagai replay.

| Level | Staging | Produksi |
| --- | --- | --- |
| stack-overwrite | 2–7 ms | 3–5 ms |
| stack-magic | 2–4 ms | 2–4 ms |
| stack-offset | 2–4 ms | 2–4 ms |
| stack-ret2win | 3–4 ms | 2–4 ms |
| stack-arguments | 5–5 ms | 3–5 ms |

Pengukuran awal menunjukkan beberapa request 27–49 ms. Emulator sebelumnya berada dalam chunk endpoint Astro yang dimuat lazy. Entrypoint Worker kini menunggu inisialisasi WASM/runner pada startup; kode RX dimuat sekali dan syscall read dibatasi ke stack RW. Tidak ada hook per instruksi. Startup Worker yang dilaporkan deploy: 169 ms staging, 171 ms produksi; ini metrik terpisah dari CPU request di tabel.

## Data dan deployment

- Migrasi 0002_remove_example_scores.sql diterapkan sesudah web baru terbit, pada staging dan produksi. Progress dan submission example-01/example-02 kini nol.
- Akun, jumlah sesi, serta progress/submission selain kedua soal contoh dibandingkan sebelum/sesudah dan tetap sama. Cache leaderboard dibangun ulang dari D1 melalui penghapusan akun uji.
- Verifikasi akhir: tidak ada akun sementara stack-smoke tersisa pada kedua lingkungan. Backup baris lama dan laporan rinci ada di .wrangler/stack-release/ lokal, di luar git.
- Web staging: 4ff17232-5cb8-402f-988b-36c22a0862f4.
- Web produksi: bca91943-af06-4a57-b625-aabf87726a1d.
- Durable Object produksi: 22d644cf-e5db-4341-818f-9300caead828.

Pengukuran adalah sampel rilis, bukan jaminan seluruh trafik mendatang. CI dikonfigurasi untuk menjalankan build/validasi/tes level, unit/lint/typecheck/build, E2E, parity browser/Node, serta smoke backend lokal.
