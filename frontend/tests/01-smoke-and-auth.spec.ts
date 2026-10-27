import { test, expect, type Page } from '@playwright/test';

// Rapid hard navigation can race the client router; Chromium reports the
// superseded document load as net::ERR_ABORTED. Retry once so a transient
// abort does not fail the route sweep, and still check the final status.
async function gotoRoute(page: Page, url: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      if (res && res.status() >= 400) throw new Error(`HTTP Error ${res.status()}`);
      return;
    } catch (err: any) {
      const retryable =
        err.message.includes('interrupted by another navigation') ||
        err.message.includes('net::ERR_ABORTED');
      if (!retryable || attempt === 2) throw err;
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
    }
  }
}

test.describe('01 - Smoke & Auth', () => {
  test.setTimeout(180000);

  test('Visit every page and check for errors', async ({ page }) => {
    await page.goto('http://127.0.0.1:3000/login');
    await page.getByRole('textbox', { name: 'Username' }).fill('owner');
    await page.getByRole('textbox', { name: 'Password' }).fill(process.env.TEST_OWNER_PASS!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard');

    const ROUTES = [
      '/dashboard', '/ops/account', '/ops/cash', '/ops/sales', '/ops/collections',
      '/ops/daily-closing', '/ops/employees', '/ops/staff', '/ops/inventory',
      '/ops/expenses', '/ops/expense-categories', '/ops/salaries', '/ops/suppliers',
      '/ops/supplier-payments', '/ops/materials', '/ops/material-categories',
      '/ops/positions', '/ops/users', '/ops/settings', '/ops/settings/backup',
      '/ops/system-access', '/reports', '/reports/daily-sales', '/reports/expenses',
      '/reports/handovers', '/reports/reconciliations', '/reports/sales-vs-pos',
      '/reports/stock-movements', '/reports/supplier-balances'
    ];

    for (const route of ROUTES) {
      await gotoRoute(page, `http://127.0.0.1:3000${route}`);
    }
  });

  test('Test Eye Icon and Password Validation', async ({ page }) => {
    await page.goto('http://127.0.0.1:3000/login');
    await page.getByRole('textbox', { name: 'Username' }).fill('owner');
    await page.getByRole('textbox', { name: 'Password' }).fill(process.env.TEST_OWNER_PASS!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard');

    await page.goto('http://127.0.0.1:3000/ops/account');
    await page.waitForSelector('form');

    const currentPw = page.locator('input[autocomplete="current-password"]');
    await currentPw.fill('secret123');
    await page.getByRole('button', { name: 'Show password' }).first().click();
    expect(await currentPw.getAttribute('type')).toBe('text');

    const newPw1 = page.locator('input[autocomplete="new-password"]').nth(0);
    const newPw2 = page.locator('input[autocomplete="new-password"]').nth(1);
    
    await currentPw.fill(process.env.TEST_OWNER_PASS!);
    await newPw1.fill('123'); 
    await newPw2.fill('123');
    await page.getByRole('button', { name: /change password|badilisha nenosiri/i }).click();
    
    await expect(page.locator('text=Password must be at least 12 characters.')).toBeVisible();
  });
});