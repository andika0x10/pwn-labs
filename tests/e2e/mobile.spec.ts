import { expect, test } from '@playwright/test';

test.describe('penggunaan di HP', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('materi dan workspace dapat dipakai dengan sentuhan', async ({ page }) => {
    await page.goto('/play/example/example-01');
    await expect(page.getByRole('tabpanel', { name: 'Materi', exact: true })).toBeVisible();
    await expect(page.getByRole('tabpanel', { name: 'Workspace', exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Buka workspace' }).tap();
    await expect(page.getByRole('tabpanel', { name: 'Materi', exact: true })).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Workspace', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Siap dijalankan.')).toBeVisible({ timeout: 30_000 });

    for (const name of ['Stack', 'Registers', 'Source', 'Disassembly']) {
      await page.getByRole('tab', { name, exact: true }).tap();
      await expect(page.getByRole('tabpanel', { name, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }

    await page.getByLabel('Payload', { exact: true }).fill('"A" * 68 + p32(0x0804802d)');
    const run = page.getByRole('button', { name: 'Jalankan', exact: true });
    const bounds = await run.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(812);
    await run.tap();
    await expect(page.getByText('Program mencapai fungsi win.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Output terminal')).toContainText('WIN');

    await page.getByRole('tab', { name: 'Materi', exact: true }).tap();
    await expect(run).toBeHidden();
    await page.getByRole('tab', { name: 'Workspace', exact: true }).tap();
    await expect(page.getByLabel('Output terminal')).toContainText('WIN');
  });

  test('halaman utama muat pada HP kecil', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const route of ['/', '/play', '/play/example', '/play/example/example-01', '/leaderboard', '/docs', '/docs/memulai']) {
      await page.goto(route);
      await expect(page.getByRole('navigation', { name: 'Utama' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
    }
  });
});
