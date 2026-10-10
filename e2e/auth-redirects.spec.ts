import { test, expect } from '@playwright/test';

test('owner redirects to /dashboard after login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/username/i).fill('owner');
  await page.getByLabel(/password/i).fill('ChangeMe!Now123');
  await page.getByRole('button', { name: /sign in|ingia/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
});

test('waiter redirects to /kiosk after login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/username/i).fill('e2e-kiosk-waiter');
  await page.getByLabel(/password/i).fill('E2eWaiter!234');
  await page.getByRole('button', { name: /sign in|ingia/i }).click();
  await expect(page).toHaveURL(/\/kiosk/, { timeout: 15_000 });
});
