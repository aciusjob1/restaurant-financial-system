import { test } from '@playwright/test';
import { loginAs } from './helpers/auth';

test('owner redirects to /dashboard after login', async ({ page }) => {
  await loginAs(page, 'owner');
});

test('waiter redirects to /kiosk after login', async ({ page }) => {
  await loginAs(page, 'waiter');
});