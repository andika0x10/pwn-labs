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
  await page.goto('/play/example/example-01');
  await page.getByRole('button', { name: 'Kirim jawaban' }).click();
  await expect(page).toHaveURL(/\/auth\/github\?next=/);
});
