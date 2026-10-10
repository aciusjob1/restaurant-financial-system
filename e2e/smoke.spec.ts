import { test, expect } from '@playwright/test';

test('login page renders and owner signs in to /dashboard', async ({ page }) => {
  await page.goto('/login');

  // Login form must render with both inputs and a submit control.
  await expect(page.getByLabel(/username/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel(/^password$/i)).toBeVisible();

  await page.getByLabel(/username/i).fill('owner');
  await page.getByLabel(/^password$/i).fill('ChangeMe!Now123');
  await page.getByRole('button', { name: /sign in|ingia/i }).click();

  // Owner role redirects to /dashboard (LoginPage.tsx L25).
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
});
