import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

// Credential rejection: the backend returns 401 INVALID_CREDENTIALS.
// The login page catches the ApiError and renders the message in a
// red-500 box (see frontend/app/login/page.tsx L45-L49). We do not
// assert the exact message text — it comes from the backend and can
// be reworded — we assert that an error element is present and that
// the page has not navigated away from /login.
test('invalid login shows an error and stays on /login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/username/i).fill('owner');
  await page.getByLabel(/^password$/i).fill('definitely-wrong-password-xyz-9f8e7d6c');
  await page.getByRole('button', { name: /sign in|ingia/i }).click();

  // The error <div> is the only element in the form with this class
  // combination. Waiting on it also confirms the request completed.
  await expect(page.locator('.text-red-600').first()).toBeVisible({
    timeout: 10_000,
  });

  // Still on /login — no redirect happened.
  await expect(page).toHaveURL(/\/login/);
});

// Unauthenticated access: OpsShell fetches /auth/me on mount; a 401
// triggers router.push('/login') at OpsShell.tsx L92. The test uses a
// fresh Playwright context, so no session cookie is present.
test('logged-out user hitting /ops/cash is redirected to /login', async ({ page }) => {
  await page.goto('/ops/cash');

  // OpsShell's redirect is client-side; waitForURL covers it.
  await page.waitForURL(/\/login/, { timeout: 15_000 });

  // The login form is rendered.
  await expect(page.getByLabel(/username/i)).toBeVisible();
});

// Role gating: OpsShell allows only OWNER and MANAGER
// (ALLOWED_ROLES at OpsShell.tsx L41). A waiter with a valid session
// visiting /ops/cash sees the denied screen, NOT a redirect to login —
// they are authenticated, just not authorized.
//
// Assertion text comes from shell.deniedOps.title / .body. The grep
// in this apply block printed the exact strings; we match against the
// content of that card generically to avoid brittleness if the copy
// is polished later.
test('waiter visiting /ops/cash sees the access-denied screen', async ({ page }) => {
  await loginAs(page, 'waiter');
  await page.goto('/ops/cash');
  await page.waitForLoadState('networkidle');

  // The denied card contains a "return to dashboard" link
  // (OpsShell.tsx L104-L109). That link is unique to the denied state
  // and is stable across copy changes.
  const returnLink = page.getByRole('link', { name: /return|dashboard/i });
  await expect(returnLink.first()).toBeVisible({ timeout: 10_000 });

  // Not redirected to login — the session is still valid.
  await expect(page).not.toHaveURL(/\/login/);
});