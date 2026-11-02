# pwn-labs: Rencana Implementasi

*Dokumen ini ditujukan untuk coding agent. Ikuti urutan fase. Setiap fase punya kriteria selesai yang harus terpenuhi sebelum lanjut.*

## 1. Ringkasan produk

`pwn-labs` adalah situs belajar binary exploitation (pwn) yang terasa seperti game. Pengguna naik level satu per satu. Setiap level terdiri dari materi singkat, lalu challenge yang dijalankan **sepenuhnya di browser** memakai emulator x86 yang dikompilasi ke WebAssembly. Tidak ada server khusus untuk menjalankan binary.

Target pengguna: pemula sampai menengah, dengan jalur belajar bertahap (world dan level).

Pembagian kerja diperbarui atas permintaan pemilik proyek: agent membangun platform, template, dan soal nyata. World pertama adalah Stack Dasar dengan lima soal x86-32 berbahasa Indonesia.

Fitur v1:

- Login dengan GitHub OAuth
- Materi teks bertahap (seperti kursus)
- Challenge interaktif di browser (emulator, disassembly, stack/memory viewer, input payload)
- Submit flag dan pelacakan progress
- Leaderboard

Di luar cakupan v1: heap exploitation, kernel pwn, multiplayer, forum, pembayaran, admin panel (konten dikelola lewat git).

## 2. Tech stack dan pembagian peran

| Komponen | Peran |
| --- | --- |
| Astro (SSR dengan `@astrojs/cloudflare`) | Routing, halaman materi (MDX), landing, API routes |
| React (islands) | Hanya untuk bagian interaktif: workspace challenge, peta level, leaderboard |
| WebAssembly | Emulator CPU di browser (Web Worker) dan verifikasi ulang di Worker |
| Cloudflare Workers | Hosting Astro dan API |
| D1 | User, progress, submission, skor |
| Durable Objects | State per sesi level dan leaderboard real-time |
| TypeScript | Seluruh kode, `strict: true` |

Catatan teknis penting:

- Durable Object class sebaiknya hidup di **Worker terpisah** (`workers/do`), lalu di-bind dari Worker Astro lewat `script_name`. Adapter Astro tidak nyaman untuk mengekspor class DO.
- Gunakan `wrangler.jsonc` di tiap Worker. Sediakan environment `dev` lokal dengan D1 dan DO lokal (`wrangler dev` atau `astro dev` dengan platform proxy).

* Styling memakai **Tailwind CSS v4** (detail di bagian 6).

### 2.1 Setup Cloudflare dengan Wrangler

Wrangler CLI di mesin ini **sudah login** ke akun Cloudflare. Agent menyiapkan semua resource Cloudflare sendiri lewat `npx wrangler <cmd>`, tanpa meminta user menjalankan langkah manual, kecuali untuk GitHub OAuth App (lihat langkah 5).

1. Verifikasi login dengan `npx wrangler whoami`. Jika belum login di lingkungan WSL ini (login di Windows tidak ikut terbawa), berhenti dan minta user menjalankan login sendiri di terminal WSL, lalu lanjutkan. Jangan menjalankan `wrangler login`.
2. Buat database D1 dengan `npx wrangler d1 create pwn-labs-db`, lalu tulis `database_id` dari hasilnya ke `wrangler.jsonc`.
3. Terapkan migrasi dengan `npx wrangler d1 migrations apply pwn-labs-db --local` untuk pengembangan. Pakai `--remote` hanya saat deploy ke staging atau produksi.
4. Deploy Worker Durable Object (`workers/do`) lebih dulu dengan `npx wrangler deploy` dari folder itu, karena Worker web mengikatnya lewat `script_name`. Setelah itu baru Worker web: `npx astro build`, lalu `npx wrangler deploy`.
5. Siapkan secret dengan `npx wrangler secret put <NAMA>` untuk `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, dan `FLAG_SECRET`. Agent membuat `FLAG_SECRET` sendiri (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, dialirkan langsung ke `wrangler secret put` dan tidak dicetak ke log). GitHub OAuth App **tidak bisa dibuat lewat Wrangler**, jadi agent berhenti di titik ini, meminta client ID dan client secret ke user, dan menyebutkan callback URL yang harus didaftarkan (`http://localhost:4321/auth/github/callback` untuk lokal dan domain Workers untuk produksi).
6. Hasilkan tipe binding dengan `npx wrangler types` setiap kali `wrangler.jsonc` berubah.

Aturan main:

- Semua resource diberi awalan `pwn-labs-`.
- Pakai `--local` untuk eksperimen. Operasi `--remote` hanya yang memang diperlukan fase yang sedang dikerjakan.
- Jangan menjalankan perintah destruktif (`d1 delete`, `delete`, `secret delete`) tanpa konfirmasi dari user.
- Catat setiap resource yang dibuat (nama, ID, perintah yang dipakai) di `AGENTS.md` bagian "Infrastruktur".
- Urutan penyiapan: D1 dan Worker web di Fase 1 dan 3, Durable Object di Fase 4, secret OAuth di Fase 3.

### 2.2 Lingkungan pengembangan: WSL

Pengembangan dilakukan di **WSL** (distro Ubuntu) dengan editor Zed yang terhubung ke WSL. Semua perintah dijalankan di terminal WSL, jadi toolchain Linux boleh dipakai.

- **Lokasi proyek**: repo hidup di filesystem WSL (misalnya `~/pwn-labs`), bukan di `/mnt/c/...`, karena yang kedua jauh lebih lambat dan file watcher sering tidak andal.
- **Instalasi di dalam WSL**: Node.js LTS (disarankan lewat `nvm` atau `fnm`) dan Git. Pastikan `which node` menunjuk ke Node milik WSL, bukan path `/mnt/c/...`. Wrangler tetap lewat `npx`.
- **Wrangler**: kredensial login tidak dibagi antara Windows dan WSL. Login dilakukan di terminal WSL dengan `npx wrangler login`. Jika browser tidak terbuka sendiri, salin URL yang dicetak ke browser Windows.
- **Dev server**: `npm run dev` di WSL dapat dibuka dari browser Windows lewat `http://localhost:4321`.
- **Skrip proyek** tetap ditulis dalam Node.js (TypeScript lewat `tsx`) supaya konsisten dan portabel. Bash boleh dipakai untuk hal kecil yang tidak perlu portabel.
- **Build challenge**: hasil build blob tetap di-commit, jadi menjalankan dan menguji proyek tidak butuh compiler. Untuk menulis challenge baru, toolchain Linux boleh dipakai (misalnya `gcc` dengan dukungan 32-bit, `nasm`, `gdb`, `make`). Daftar paket `apt` yang dibutuhkan dicatat di `docs/authoring.md`, dan skrip `build:challenges` harus gagal dengan pesan jelas bila toolchain belum terpasang.
- **Build WASM**: utamakan paket Unicorn dan Capstone WASM yang sudah jadi. Jika perlu build sendiri, Emscripten (emsdk) boleh dipasang di WSL.
- **Tes browser**: Playwright dijalankan headless di WSL. Browser dan dependensinya dipasang dengan `npx playwright install --with-deps chromium`, yang butuh `sudo`. Minta user menjalankannya bila agent tidak punya akses `sudo`.
- **Line ending**: tambahkan `.gitattributes` (`* text=auto eol=lf`, dan tandai `*.bin`, `*.wasm`, `*.payload` bila biner sebagai `binary`) serta `.editorconfig`, supaya repo tetap aman bila suatu saat dibuka dari Windows.
- Catat versi Node yang dipakai (`engines` di `package.json` dan `.nvmrc`) dan catatan lingkungan WSL di `AGENTS.md` bagian "Lingkungan".

### 2.3 Plan Cloudflare: Workers Free

Proyek berjalan di **Workers Free** (tanpa biaya). Seluruh desain harus muat di batasnya. Batas yang paling berpengaruh (menurut [dokumentasi limit Workers](https://developers.cloudflare.com/workers/about/limits), angka bisa berubah jadi verifikasi lagi di Fase 0):

| Batas | Workers Free | Dampak ke pwn-labs |
| --- | --- | --- |
| CPU time per request | 10 ms | Replay payload di Worker (bagian 3.3) harus sangat ringan. Ini risiko terbesar. |
| Ukuran Worker | 3 MB setelah kompresi | Kode Worker dan WASM emulator harus muat bersama. |
| Request ke Worker | 100.000 per hari (1.000 per menit) | Jaga halaman yang bisa statis tetap statis. Aset statis gratis dan tidak terbatas. |
| D1 | Sekitar 5 juta baris dibaca dan 100 ribu baris ditulis per hari, 5 GB total (angka perkiraan, verifikasi di dokumentasi D1) | Pakai indeks, batasi leaderboard ke top N, jangan menulis satu baris per percobaan salah. |
| Durable Objects | Hanya yang berbasis SQLite | Deklarasikan class dengan `new_sqlite_classes` di migrasi `wrangler.jsonc` dan pakai SQLite storage API. |

Aturan untuk agent:

- **Ukur di Fase 0**: ukuran bundle dan CPU time satu kali replay payload. Hasil di `wrangler dev` hanya gambaran awal karena bisa berbeda dari produksi, jadi konfirmasi dengan deploy staging ke `workers.dev`.
- **Jika replay melebihi 10 ms CPU**: perkecil dulu (batas instruksi lebih rendah, binary lebih kecil, instansiasi WASM sekali di global scope). Jika masih melebihi, **berhenti dan laporkan** dengan angka hasil ukur. Pilihan untuk user: upgrade ke Workers Paid, atau verifikasi tanpa replay (anti-cheat lebih lemah). Agent tidak memutuskan sendiri.
- **Halaman statis sebisa mungkin**: landing, docs, dan materi di-prerender. SSR hanya untuk halaman yang butuh sesi atau progress.
- **Percobaan salah** dicatat sebagai counter di `LevelSession`, bukan baris D1. D1 hanya menyimpan progress dan submission yang benar.
- **Leaderboard**: query top N dengan indeks, di-cache di Durable Object. Jika WebSocket terkendala batas free, fallback ke polling tiap 15 detik.
- **Jangan memakai layanan berbayar** (misalnya Containers). Jika sebuah fase membutuhkannya, berhenti dan laporkan.

## 3. Arsitektur eksekusi challenge

### 3.1 Emulator

Rekomendasi: **Unicorn Engine** (x86 dan x86-64) dikompilasi ke WASM dengan Emscripten, ditambah **Capstone** (WASM) untuk disassembly. Binary challenge berupa **raw blob kecil** yang dimuat ke memori emulator oleh loader buatan kita sendiri, bukan ELF penuh. Ini menjaga ukuran kecil dan perilakunya deterministik.

Layer syscall minimal yang kita implementasikan sendiri di sisi JS: `read` (dari buffer payload), `write` (ke terminal virtual), `exit`. Tidak ada filesystem, tidak ada jaringan.

**Fase 0 wajib berupa spike** untuk memvalidasi tiga hal sebelum membangun apa pun:

1. Apakah paket Unicorn WASM yang sudah ada (cek npm) layak dipakai, atau perlu build sendiri.
2. Apakah ukuran WASM masih muat di batas ukuran Worker (batas Workers Free adalah 3 MB setelah kompresi, mencakup kode Worker dan WASM). Jika terlalu besar, fallback: emulator verifikasi server memakai build yang lebih kecil (hanya x86-32, tanpa fitur tak terpakai), atau tulis VM kecil sendiri dengan subset instruksi.

Hal ketiga yang diukur adalah CPU time satu kali replay payload di Worker, karena Workers Free hanya memberi 10 ms CPU per request (lihat 2.3). Jika salah satu dari ketiga hal ini gagal, hentikan dan laporkan sebelum lanjut.

### 3.2 Menjalankan di browser

- Emulator berjalan di **Web Worker**, dikomunikasikan lewat `postMessage` (atau Comlink).
- Batas keamanan: maksimum instruksi per run (misalnya 1 juta), timeout wall-clock, batas ukuran payload.
- API worker: `load(level)`, `run(payload)`, `step()`, `continue()`, `setBreakpoint(addr)`, `getRegisters()`, `readMemory(addr, len)`, `disassemble(addr, n)`.

### 3.3 Anti-cheat dan verifikasi flag (penting)

Karena emulator berjalan di klien, flag **tidak boleh dikirim ke browser**. Rancangan:

1. Klien menjalankan payload di emulator lokal untuk umpan balik cepat.
2. Saat user menekan **Submit**, klien mengirim **payload mentah** ke API.
3. Worker memuat emulator WASM yang sama, menjalankan ulang payload dengan seed yang sama (deterministik), dan memeriksa kondisi sukses level (misalnya EIP/RIP mencapai alamat `win`, atau output mengandung penanda tertentu).
4. Jika sukses, server mengembalikan flag yang diturunkan dari `HMAC(SECRET, userId + levelId)`. Flag disimpan hashnya di D1 untuk validasi submit manual.

Seed per user per level (untuk menggeser alamat/stack secara ringan agar jawaban tidak bisa disalin antar user) dikeluarkan oleh Durable Object `LevelSession`.

## 4. Model data

### D1 (skema awal)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,            -- uuid
  github_id INTEGER UNIQUE NOT NULL,
  username TEXT NOT NULL,
  avatar_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,            -- hash dari token cookie
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE progress (
  user_id TEXT NOT NULL REFERENCES users(id),
  level_id TEXT NOT NULL,         -- contoh: stack-03-ret2win
  solved_at INTEGER NOT NULL,
  points INTEGER NOT NULL,
  hints_used INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, level_id)
);

CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  level_id TEXT NOT NULL,
  correct INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_progress_user ON progress(user_id);
```

Definisi level (judul, urutan, poin, hint, konfigurasi emulator) **tidak disimpan di D1**. Semua ada di content collection Astro supaya bisa direview lewat git.

### Durable Objects

- **`LevelSession`** (id = `userId:levelId`): menyimpan seed, jumlah percobaan, hint yang sudah dibuka, dan melakukan rate limit submit (misalnya 10 per menit).
- **`Leaderboard`** (singleton): menjaga ranking di memori dengan persistence ke storage, menerima update dari API setelah level terselesaikan, dan mem-broadcast perubahan lewat WebSocket (gunakan hibernation API). D1 tetap menjadi sumber kebenaran, DO hanya cache real-time yang bisa dibangun ulang dari D1.

## 5. Konten dan struktur level

Konten ada di `src/content/levels/<world>/<id>.mdx` dengan frontmatter berikut (nilainya hanya ilustrasi format, bukan level yang harus dibuat):

```yaml
id: stack-03-ret2win
world: stack
order: 3
title: Return ke Fungsi win
points: 100
arch: x86-32
binary: /binaries/stack-03.bin
success: { type: "eip-reaches", symbol: "win" }
hints:
  - "Berapa byte dari awal buffer sampai return address?"
  - "Cari alamat fungsi win di panel disassembly."
requires: [stack-02-overwrite-var]
```

Binary challenge ditulis sebagai assembly GNU di `challenges/src/`, dibangun dengan GCC/binutils lewat `npm run build:challenges`. Representasi C disediakan untuk belajar dan diberi label demikian. Blob, simbol, source publik, dan manifest hasil build di-commit agar menjalankan situs tidak membutuhkan toolchain.

### Template konten (tugas agent)

**Agent membangun platform, template, dan soal nyata sesuai arahan pemilik proyek.** Template tetap memudahkan penambahan level berikutnya.

1. **Skema frontmatter** di `src/content.config.ts` (zod). Validasi: `id` unik, `requires` merujuk level yang ada, file binary ada, poin positif, `arch` salah satu nilai yang didukung. Tambahkan field opsional `draft` dan `example`. Pesan error harus menyebut file dan field yang salah.
2. **Template level** di `templates/level/`:
   - `level.mdx`: frontmatter lengkap dengan komentar per field, serta kerangka materi (Tujuan, Konsep, Panduan alat, Tantangan, Hint) berisi placeholder `TODO`.
   - `challenge.S`: kerangka freestanding dengan `_start` dan `win`; `challenge.c` merupakan representasi konsep. Keduanya memuat tempat kerentanan dan kondisi sukses.
   - `solution.payload`: payload ekspresi (format di bagian 6) yang dipakai CI untuk memverifikasi level. Tidak pernah dikirim ke klien.
   - `negative.json`: ekspresi payload salah untuk regresi. Konfigurasi emulator berada di frontmatter; simbol dihasilkan build.
3. **Template world** di `templates/world/`: `world.json` (id, judul, deskripsi, urutan) dan halaman pengantar `index.mdx`.
4. **Skrip scaffold**: `npm run new:world -- <slug>` dan `npm run new:level -- <world> <slug>` menyalin template ke lokasi yang benar, lalu mengisi `id`, urutan, dan path binary secara otomatis. Level baru dibuat dengan `draft: true`.
5. **Skrip validasi dan tes**: `npm run validate:content` memeriksa skema, prasyarat, dan file. `npm run build:challenges` membuat blob dari `challenges/src/`. `npm run test:levels` menjalankan `solution.payload` tiap level di emulator dan memastikan kondisi sukses tercapai. Ketiganya berjalan di CI. Level `draft: true` dilewati tes dan tidak tampil di produksi.
6. **Lima soal nyata** di world `stack`: `stack-overwrite` (100), `stack-magic` (150), `stack-offset` (200), `stack-ret2win` (250), dan `stack-arguments` (300). Prasyarat berurutan; tiga hint per soal. Hapus world contoh beserta aset, progress, dan submission kedua soal contohnya, lalu bangun ulang leaderboard.
7. **Panduan authoring** di `docs/authoring.md`: cara membuat world dan level dari nol, format payload, cara menjalankan tes level, dan checklist sebelum menerbitkan.

Flag tidak pernah ditulis di konten. Server menurunkannya sendiri (bagian 3.3).

### Arah kurikulum lanjutan

Daftar berikut adalah arah lanjutan setelah lima soal Stack Dasar terbit. Soal nyata kini boleh ditulis agent atas arahan pemilik proyek.

**World 1: Stack** (v1)

1. Memori, register, dan stack: membaca nilai (tanpa exploit, hanya pengenalan alat)
2. Overwrite variabel di sebelah buffer
3. Return ke fungsi `win` (ret2win)
4. ret2win dengan argumen di stack (x86-32)
5. Mengontrol RIP di x86-64 dan masalah alignment

**World 2: Shellcode** (v1)

6. Menjalankan shellcode sederhana di stack (syscall tiruan)
7. Shellcode dengan batasan karakter
8. Memakai `jmp esp`

**World 3: ROP dan World 4: Format string** (setelah v1)

### Sistem game

- Level terkunci sampai prasyarat selesai (`requires`).
- Poin per level, bonus kecil untuk first solve dan tanpa hint, pengurangan poin per hint.
- Peta level berupa grid atau jalur sederhana per world, bukan ilustrasi rumit. Status: terkunci, tersedia, selesai.

## 6. UI dan desain

Tema **putih terang, banyak ruang kosong, tenang**. Hindari gradien, bayangan tebal, dan animasi berlebihan.

### Design tokens (CSS variables di `src/styles/tokens.css`)

```css
:root {
  --bg: #ffffff;
  --surface: #fafaf9;
  --border: #e7e5e4;
  --text: #1c1917;
  --text-muted: #78716c;
  --accent: #2f5bff;        /* satu-satunya warna aksen */
  --success: #15803d;
  --danger: #b91c1c;
  --radius: 8px;
  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
```

**Styling memakai Tailwind CSS v4.** Token di atas tetap menjadi sumber kebenaran, lalu dipetakan ke tema Tailwind di `src/styles/global.css`:

```css
@import "tailwindcss";

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-border: var(--border);
  --color-fg: var(--text);
  --color-muted: var(--text-muted);
  --color-accent: var(--accent);
  --color-success: var(--success);
  --color-danger: var(--danger);
  --radius-base: var(--radius);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
}
```

Dengan pemetaan ini, utility seperti `bg-surface`, `text-muted`, `border-border`, `text-accent`, `rounded-base`, dan `font-mono` langsung memakai token.

- Pasang lewat plugin Vite `@tailwindcss/vite` di `astro.config.mjs`. Jangan memakai `@astrojs/tailwind`, karena itu untuk Tailwind v3.
- Import `global.css` sekali di layout dasar. React islands memakai kelas Tailwind yang sama, tanpa CSS-in-JS dan tanpa `style` inline kecuali nilainya dinamis (misalnya posisi di memory viewer).
- Warna hanya lewat token. Jangan menulis nilai heksadesimal langsung di komponen.
- Untuk varian komponen React, gunakan `clsx` dan `tailwind-merge`. Gunakan `@apply` seperlunya, hanya untuk pola yang benar-benar berulang (misalnya gaya prose materi MDX).
- Gaya teks materi MDX memakai `@tailwindcss/typography` yang disesuaikan dengan token, dengan lebar maksimum sekitar 68ch.

* Font: **Inter** untuk teks dan **JetBrains Mono** untuk kode, hex dump, dan terminal. Self-host lewat `@fontsource-variable/inter` dan `@fontsource-variable/jetbrains-mono`, jangan dari CDN.
* Lebar konten materi maksimum sekitar 68ch. Jarak antar section besar (minimal 64px di desktop).
* Gaya komponen: border tipis 1px, radius 8px, tombol solid satu warna aksen, hover halus.
* Aksesibilitas: kontras AA, navigasi keyboard, `prefers-reduced-motion` dihormati. Tidak perlu dark mode di v1, tetapi pakai token agar mudah ditambah nanti.

### Halaman

| Path | Fungsi | Render | Login | Isi utama |
| --- | --- | --- | --- | --- |
| `/` | Landing | Statis | Tidak | Satu kalimat nilai jual, tombol "Mulai bermain", cara kerja dalam 3 langkah, pratinjau world, tautan leaderboard |
| `/play` | Peta semua world | SSR | Opsional | Kartu world dengan progress, status level (terkunci, tersedia, selesai) |
| `/play/[world]` | Satu world | SSR | Opsional | Pengantar world, daftar level berurutan, poin dan progress world |
| `/play/[world]/[level]` | Halaman level | SSR | Opsional untuk bermain, wajib untuk submit | Materi, workspace emulator, hint, tombol Submit, level berikutnya |
| `/docs` dan `/docs/[slug]` | Panduan alat dan referensi | Statis | Tidak | Cara memakai workspace, sintaks payload, referensi register dan instruksi x86 dasar, glosarium |
| `/leaderboard` | Peringkat | SSR + WebSocket | Tidak | Tabel peringkat (posisi, username, poin, level selesai), baris milik sendiri disorot |
| `/u/[username]` | Profil publik | SSR | Tidak | Avatar, total poin, peringkat, daftar level selesai |
| `/me` | Pengaturan akun | SSR | Wajib | Ringkasan progress, tombol logout, hapus akun |
| `/auth/github` | Mulai OAuth | SSR (redirect) | Tidak | Redirect ke GitHub dengan `state` |
| `/auth/github/callback` | Selesaikan OAuth | SSR (redirect) | Tidak | Tukar kode, buat sesi, redirect ke `next` |
| `/auth/logout` | Logout | SSR (POST) | Wajib | Hapus sesi, redirect ke `/` |
| `/404` dan `/500` | Halaman error | Statis | Tidak | Pesan singkat dan tautan kembali ke `/play` |

Aturan perilaku:

- **Tanpa login**: pengunjung boleh membaca materi dan menjalankan emulator di semua level yang tersedia. Login hanya dibutuhkan untuk submit, menyimpan progress, dan masuk leaderboard. Halaman level menampilkan ajakan login yang tenang saat pengunjung menekan Submit.
- **Level terkunci**: server menolak akses ke level yang prasyaratnya belum selesai dengan redirect ke `/play/[world]` disertai pesan. Penguncian tidak hanya di UI.
- **Setelah login**: redirect ke path internal dari parameter `next`. Tolak nilai `next` yang bukan path internal.
- **Level `draft: true`**: tidak muncul di daftar dan mengembalikan 404 di produksi.
- **Navigasi**: header berisi logo `pwn-labs`, tautan Play, Docs, Leaderboard, dan tombol login atau avatar. Footer minimal (tautan repositori). Satu pola header untuk semua halaman.

### Halaman level

Dua kolom di desktop (satu kolom di mobile dengan tab):

- **Kiri**: materi MDX, hint yang bisa dibuka satu per satu
- **Kanan (workspace, React island)**, dengan tab:
  - Source (kode C bila ada)
  - Disassembly (Capstone), dengan highlight instruksi saat step
  - Stack dan memory viewer (hex dump, penanda return address dan buffer)
  - Registers
  - Terminal (output program) dan input payload

### Payload builder (pwntools-lite)

Input payload berupa ekspresi sederhana yang diparse dengan parser buatan sendiri, **bukan `eval`**:

```
"A" * 64 + p32(0x08049196)
cyclic(100)
b"\x90" * 16 + shellcode
```

Fungsi yang didukung di v1: string dan bytes literal, `*`, `+`, `p32`, `p64`, `cyclic`, `cyclic_find`, `nop`, hex literal. Tampilkan hasil sebagai hex dump di bawah input.

## 7. Autentikasi

- GitHub OAuth, flow authorization code dengan `state` dan PKCE bila memungkinkan. Boleh memakai library `arctic`.
- Sesi: token acak di cookie `HttpOnly`, `Secure`, `SameSite=Lax`. Simpan hash token di tabel `sessions`.
- Middleware Astro (`src/middleware.ts`) memuat user dari sesi dan menaruhnya di `Astro.locals`.
- Semua endpoint yang mengubah state harus memeriksa sesi dan memakai proteksi CSRF (cek header `Origin`).

## 8. API (Astro endpoints)

| Method | Path | Fungsi |
| --- | --- | --- |
| GET | `/api/levels/:id/session` | Ambil seed dan status dari `LevelSession` |
| POST | `/api/levels/:id/submit` | Kirim payload, verifikasi ulang di server, kembalikan flag bila sukses |
| POST | `/api/levels/:id/flag` | Submit flag manual (opsional) |
| POST | `/api/levels/:id/hint` | Buka hint berikutnya |
| GET | `/api/leaderboard` | Snapshot ranking |
| GET (WS) | `/api/leaderboard/live` | Stream update dari DO |

Validasi semua input dengan `zod`. Batasi ukuran body (misalnya 4 KB untuk payload).

## 9. Struktur repositori

```
pwn-labs/
  apps/web/                 # Astro + React
    src/
      components/           # UI umum
      islands/              # React: Workspace, LevelMap, Leaderboard
      content/levels/       # MDX per level
      lib/emulator/         # wrapper worker, tipe, loader
      lib/payload/          # parser pwntools-lite
      pages/ , middleware.ts
      styles/tokens.css
    public/binaries/        # blob challenge hasil build
    public/wasm/
  workers/do/               # LevelSession dan Leaderboard
  packages/emulator-core/   # pembungkus WASM yang dipakai browser dan Worker
  challenges/src/           # sumber C/asm challenge dan skrip build
  migrations/               # SQL D1
  AGENTS.md
```

Gunakan npm workspaces (field workspaces di package.json root). Bagikan tipe dan skema zod lewat package internal.

## 10. Fase kerja dan kriteria selesai

### Fase 0: Spike emulator (wajib pertama)

- Jalankan satu blob x86-32 di Unicorn WASM dalam Web Worker, dengan payload yang menimpa return address.
- Jalankan hal yang sama di dalam Worker Cloudflare lokal (`wrangler dev`).
- **Selesai bila**: kedua lingkungan menghasilkan hasil identik, ukuran WASM dan CPU time replay tercatat, dan temuan dilaporkan.

### Fase 1: Fondasi proyek dan desain

- Scaffold monorepo, Astro + React + Tailwind CSS v4 + adapter Cloudflare, tokens, font, layout dasar, landing, halaman materi MDX statis.
- **Selesai bila**: `npm run dev` jalan, tampilan sesuai bagian 6, Lighthouse a11y minimal 95.

### Fase 2: Workspace challenge (tanpa akun)

- Emulator worker lengkap, disassembly, stack viewer, registers, terminal, payload builder.
- Level Stack dari template (bagian 5) dapat diselesaikan secara lokal.
- **Selesai bila**: ada tes otomatis (Vitest) untuk parser payload dan emulator, serta tes Playwright yang menyelesaikan level Stack.

### Fase 3: Auth, D1, progress

- GitHub OAuth, migrasi D1, middleware, halaman `/me`.
- **Selesai bila**: login dan logout bekerja di lokal dan staging, sesi aman sesuai bagian 7.

### Fase 4: Verifikasi server dan flag

- `LevelSession` DO, endpoint submit dengan replay di Worker, penurunan flag HMAC, rate limit.
- **Selesai bila**: payload benar menghasilkan flag, payload salah ditolak, flag tidak pernah muncul di bundle klien atau response yang tidak sukses.

### Fase 5: Game layer dan leaderboard

- Peta level, penguncian, poin, hint, `Leaderboard` DO dengan WebSocket.
- **Selesai bila**: urutan level ditegakkan di server (bukan hanya UI) dan leaderboard ter-update real-time.

### Fase 6: Panduan authoring dan rilis

- Tulis panduan authoring (\`docs/authoring.md\`) dan pastikan scaffold level bekerja dari awal sampai akhir.
- Deploy ke Cloudflare (staging lalu produksi), CI untuk lint, typecheck, test.
- **Selesai bila**: level Stack bisa diselesaikan dari akun baru di produksi, dan level baru bisa dibuat dari scaffold tanpa mengubah kode platform.

## 11. Aturan untuk coding agent

- Kerjakan satu fase per sesi, commit kecil dengan pesan jelas.
- Jangan memakai `eval`, `new Function`, atau `innerHTML` dengan data pengguna.
- Jangan menaruh secret (GitHub client secret, `FLAG_SECRET`) di repo. Gunakan `wrangler secret`.
- Jangan menambah dependensi besar tanpa alasan. Catat alasan di PR.
- Bila ada keputusan yang belum ditentukan di dokumen ini, pilih opsi paling sederhana dan catat di `AGENTS.md` bagian "Keputusan".
- Bila Fase 0 menunjukkan asumsi di dokumen ini salah, **berhenti dan laporkan** sebelum mengubah arsitektur.

* Proyek berjalan di Workers Free (bagian 2.3). Jangan menambah layanan berbayar tanpa persetujuan user.

- Pengembangan dilakukan di WSL (bagian 2.2). Jalankan semua perintah di terminal WSL dan simpan proyek di filesystem WSL.

* Tulis materi dan soal nyata sesuai kurikulum yang disetujui pemilik proyek. Solution tetap privat di repo, di luar aset publik dan bundle klien.

- Setiap commit git wajib memakai trailer `Co-Authored-By` di akhir pesan commit, dengan nama model yang sedang dipakai agent dan email `noreply@anthropic.com`. Pisahkan trailer dari isi pesan dengan satu baris kosong. Contoh pesan commit lengkap:

```
feat(emulator): load raw x86-32 blob in web worker

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

Jika model yang dipakai berbeda, ganti namanya sesuai model tersebut.
