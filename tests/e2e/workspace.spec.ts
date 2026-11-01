import { expect, test, type Page } from '@playwright/test';

const levelPath = '/play/example/example-01';

async function openWorkspace(page: Page) {
  await page.goto(levelPath);
  await expect(page.getByRole('button', { name: 'Uji payload' })).toBeEnabled({ timeout: 30_000 });
}

// Kendalikan waktu/error worker untuk menguji UI, bukan perilaku CPU.
async function mockWorker(page: Page, mode: 'delayed' | 'error') {
  await page.route('**/emulator/worker.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `self.onmessage = ({ data: { id, command } }) => {
      const data = { reason: 'ready', stdout: '', registers: {}, stack: [] };
      if (command === 'load') self.postMessage({ id, ok: true, data });
      else setTimeout(() => self.postMessage(${mode === 'error'
        ? "{ id, ok: false, error: { message: 'Uji terputus. Coba kembali.' } }"
        : "{ id, ok: true, data: { ...data, reachedWin: true, stdout: 'WIN' } }"}), 800);
    };`,
  }));
}

// Simulasikan props pengguna masuk untuk menguji alur submit tanpa akun OAuth sungguhan.
async function mockSignedInPage(page: Page) {
  await page.route('**/play/example/example-01', async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    expect(html).toContain('&quot;authenticated&quot;:[0,false]');
    await route.fulfill({ response, body: html.replace('&quot;authenticated&quot;:[0,false]', '&quot;authenticated&quot;:[0,true]') });
  });
}

test('tamu dapat menjalankan payload level contoh', async ({ page }) => {
  await page.goto('/play/example/example-01');
  await expect(page.getByRole('heading', { name: 'Ubah return address' })).toBeVisible();
  await expect(page.getByText('Siap diuji. Baca kode sumber, lalu periksa payload Anda.')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Uji payload' }).click();
  await expect(page.getByText('Uji berhasil: program mencapai win. Kirim jawaban untuk diperiksa server dan menyimpan poin.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Output terminal')).toContainText('WIN');
});

test('submit tamu diarahkan ke GitHub OAuth', async ({ page }) => {
  await page.route('https://github.com/login/oauth/authorize**', (route) => route.abort());
  await page.goto('/play/example/example-01');
  const callback = new URL('/auth/github/callback', page.url()).href;
  const oauthRequest = page.waitForRequest((request) => request.url().startsWith('https://github.com/login/oauth/authorize'));
  await expect(page.getByRole('button', { name: 'Uji payload' })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Uji payload' }).click();
  await expect(page.getByRole('button', { name: 'Kirim jawaban' })).toBeEnabled();
  await page.getByRole('button', { name: 'Kirim jawaban' }).click();
  const url = new URL((await oauthRequest).url());
  expect(url.searchParams.get('redirect_uri')).toBe(callback);
  expect(url.searchParams.get('state')).toHaveLength(40);
  expect(url.searchParams.get('code_challenge')).toBeTruthy();
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
});

test('panduan menampilkan kode sumber dan mengharuskan uji ulang setiap perubahan', async ({ page }) => {
  await openWorkspace(page);
  const submit = page.getByRole('button', { name: 'Kirim jawaban' });
  const run = page.getByRole('button', { name: 'Uji payload' });
  const payload = page.getByLabel('Payload', { exact: true });
  await expect(page.getByRole('tab', { name: 'Kode sumber', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(submit).toBeDisabled();
  await expect(page.getByRole('button', { name: /^(Step|Continue)$/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Level berikutnya/ })).toHaveCount(0);
  await run.click();
  await expect(submit).toBeEnabled();
  await payload.fill('"A" * 64');
  await expect(submit).toBeDisabled();
  await expect(page.getByLabel('Output terminal')).toHaveCount(0);
  await run.click();
  await expect(page.getByRole('status')).toContainText('Uji belum berhasil');
  await expect(submit).toBeDisabled();
  await payload.fill('p32(');
  await expect(page.getByText(/Perbaiki format payload:/)).toBeVisible();
  await expect(run).toBeDisabled();
  await payload.fill('"A" * 68 + p32(0x0804802d)');
  await run.click();
  await expect(submit).toBeEnabled();
  // Mengembalikan teks sebelumnya tetap memerlukan uji baru.
  await payload.fill('"A" * 64');
  await payload.fill('"A" * 68 + p32(0x0804802d)');
  await expect(submit).toBeDisabled();
  await page.getByRole('button', { name: 'Lihat petunjuk 1' }).click();
  await expect(page.getByText('Petunjuk 1:', { exact: false })).toBeVisible();
});

test('hasil uji lama diabaikan saat payload berubah dan klik ganda dicegah', async ({ page }) => {
  await mockWorker(page, 'delayed');
  await openWorkspace(page);
  const run = page.getByRole('button', { name: 'Uji payload' });
  await run.click();
  await expect(run).toBeDisabled();
  await page.getByLabel('Payload', { exact: true }).fill('"B" * 64');
  await expect(run).toBeEnabled();
  await expect(page.getByRole('status')).toContainText('Payload berubah');
  await expect(page.getByRole('button', { name: 'Kirim jawaban' })).toBeDisabled();
  await expect(page.getByLabel('Output terminal')).toHaveCount(0);
});

test('error worker melepaskan tombol agar pengujian dapat dicoba kembali', async ({ page }) => {
  await mockWorker(page, 'error');
  await openWorkspace(page);
  const run = page.getByRole('button', { name: 'Uji payload' });
  await run.click();
  await expect(page.getByRole('status')).toContainText('Uji gagal. Uji terputus.');
  await expect(run).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Kirim jawaban' })).toBeDisabled();
});

test('draf bertahan setelah kembali ke halaman dan wajib diuji ulang', async ({ page }) => {
  await openWorkspace(page);
  const draft = '"B" * 68 + p32(0x0804802d)';
  await page.getByLabel('Payload', { exact: true }).fill(draft);
  await page.getByRole('button', { name: 'Uji payload' }).click();
  await expect(page.getByRole('button', { name: 'Kirim jawaban' })).toBeEnabled();
  await page.goto('/play');
  await openWorkspace(page);
  await expect(page.getByLabel('Payload', { exact: true })).toHaveValue(draft);
  await expect(page.getByRole('button', { name: 'Kirim jawaban' })).toBeDisabled();
});

test('pengiriman menangani jaringan, penolakan, dan keberhasilan server', async ({ page }) => {
  await mockSignedInPage(page);
  let attempts = 0;
  await page.route('**/api/levels/example-01/submit', async (route) => {
    attempts++;
    if (attempts === 1) return route.abort('failed');
    if (attempts === 2) return route.fulfill({ status: 422, json: { error: { message: 'Payload belum memenuhi tujuan.' } } });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const body = route.request().postDataJSON();
    expect(body.payload).toHaveLength(72);
    await route.fulfill({ json: { data: { flag: 'pwn{contoh}', points: 100 } } });
  });
  await openWorkspace(page);
  const submit = page.getByRole('button', { name: 'Kirim jawaban' });
  await page.getByRole('button', { name: 'Uji payload' }).click();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole('status')).toContainText('Hasil pengiriman belum dapat dikonfirmasi');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole('status')).toContainText('Jawaban belum diterima. Payload belum memenuhi tujuan.');
  await submit.click();
  await expect(submit).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Uji payload' })).toBeDisabled();
  await page.getByRole('button', { name: 'Pahami', exact: true }).click();
  await expect(page.getByLabel('Payload', { exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Jawaban diterima server');
  await expect(page.getByText('pwn{contoh}', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Level berikutnya/ })).toBeVisible();
  await expect(submit).toBeDisabled();
  expect(attempts).toBe(3);
});

test('tab teknis dapat dinavigasi dengan keyboard', async ({ page }) => {
  await openWorkspace(page);
  const source = page.getByRole('tab', { name: 'Kode sumber', exact: true });
  await source.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Instruksi mesin', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Instruksi mesin', exact: true })).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Register CPU', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(source).toBeFocused();
  await expect(source).toHaveAttribute('aria-selected', 'true');
});
