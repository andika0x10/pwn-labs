import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import manifest from '../../challenges/manifest.json' with { type: 'json' };

const entries = Object.entries(manifest);
for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
  test.describe('kurikulum ' + viewport.width + 'px', () => {
    test.use({ viewport });
    for (const [id, challenge] of entries) {
      const expression = readFileSync('challenges/src/' + id + '/solution.payload', 'utf8')
        .replace(/\{\{(\w+)\}\}/g, (_match, symbol: string) => String((challenge.symbols as Record<string, number>)[symbol])).trim();
      test(id + ' memakai binary dan snapshot aktual', async ({ page }) => {
        await page.goto('/play/stack/' + id);
        if (viewport.width < 1024) await page.getByRole('button', { name: 'Buka workspace' }).click();
        const run = page.getByRole('button', { name: 'Uji payload', exact: true });
        await expect(run).toBeEnabled({ timeout: 30_000 });
        await expect(page.getByLabel('Payload', { exact: true })).toHaveValue('"A" * 8');
        await run.click();
        await expect(page.getByRole('status')).toContainText('Uji belum berhasil');
        await expect(page.getByRole('button', { name: 'Kirim jawaban' })).toBeDisabled();
        await page.getByLabel('Payload', { exact: true }).fill(expression);
        await run.click();
        await expect(page.getByRole('status')).toContainText('kondisi sukses terpenuhi');
        await expect(page.getByLabel('Output terminal')).toContainText(challenge.success.value);
        await page.getByRole('tab', { name: 'Memori stack', exact: true }).click();
        await expect(page.getByRole('tabpanel', { name: 'Memori stack', exact: true })).toContainText('41 41 41 41');
        await expect(page.getByRole('tabpanel', { name: 'Memori stack', exact: true })).toContainText('Alamat kembali');
        await page.getByRole('tab', { name: 'Register CPU', exact: true }).click();
        await expect(page.getByRole('tabpanel', { name: 'Register CPU', exact: true })).toContainText('eip');
      });
    }
  });
}
test('offset cyclic terlihat pada EIP sesudah crash', async ({ page }) => {
  await page.goto('/play/stack/stack-offset');
  const run = page.getByRole('button', { name: 'Uji payload', exact: true });
  await expect(run).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel('Payload', { exact: true }).fill('cyclic(80)');
  await run.click();
  await expect(page.getByRole('status')).toContainText('Uji belum berhasil');
  await page.getByRole('tab', { name: 'Register CPU', exact: true }).click();
  // Pola pada offset 44: "oaap", little-endian 0x7061616f.
  await expect(page.getByRole('tabpanel', { name: 'Register CPU', exact: true })).toContainText('0x7061616f');
});
test('world dan aset contoh sudah dihapus', async ({ page, request }) => {
  await page.goto('/play');
  await expect(page.getByText('Stack Dasar', { exact: true })).toBeVisible();
  for (const path of ['/play/example', '/play/example/example-01', '/play/example/example-02']) {
    const response = await request.get(path);
    expect(response.url()).toMatch(/\/404$/);
  }
  for (const path of ['/binaries/example-01.bin', '/binaries/example-02.bin', '/sources/example-01.c', '/sources/example-02.c']) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
  }
});
