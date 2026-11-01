import { expect, test } from '@playwright/test';

test('tamu dapat menjalankan payload level contoh', async ({ page }) => {
  await page.goto('/play/example/example-01');
  await expect(page.getByRole('heading', { name: 'Ubah return address' })).toBeVisible();
  await expect(page.getByText('Siap dijalankan.')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Jalankan' }).click();
  await expect(page.getByText('Program mencapai fungsi win.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Output terminal')).toContainText('WIN');
});

test('submit tamu diarahkan ke GitHub OAuth', async ({ page }) => {
  await page.route('https://github.com/login/oauth/authorize**', (route) => route.abort());
  await page.goto('/play/example/example-01');
  const oauthRequest = page.waitForRequest((request) => request.url().startsWith('https://github.com/login/oauth/authorize'));
  await page.getByRole('button', { name: 'Kirim jawaban' }).click();
  const url = new URL((await oauthRequest).url());
  expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:4321/auth/github/callback');
  expect(url.searchParams.get('state')).toHaveLength(40);
  expect(url.searchParams.get('code_challenge')).toBeTruthy();
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
});
