import { test, expect } from '@playwright/test';

test.describe('03 - Reports Generation', () => {
  test('Check all reports render', async ({ page }) => {
    await page.goto('http://127.0.0.1:3000/login');
    await page.getByRole('textbox', { name: 'Username' }).fill('owner');
    await page.getByRole('textbox', { name: 'Password' }).fill(process.env.TEST_OWNER_PASS!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard');

    const reports = [
      '/reports', '/reports/daily-sales', '/reports/expenses',
      '/reports/handovers', '/reports/reconciliations', '/reports/sales-vs-pos',
      '/reports/stock-movements', '/reports/supplier-balances'
    ];

    for (const path of reports) {
      await page.goto(`http://127.0.0.1:3000${path}`, { waitUntil: 'domcontentloaded' });
      
      // Look for the layout container to prove the page mounted
      const contentLoaded = page.locator('main, h1, table, div.flex-1').first();
      await expect(contentLoaded).toBeVisible({ timeout: 10000 });
    }
  });
});