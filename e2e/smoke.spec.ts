import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

// Sidebar destinations, from frontend/components/ops/OpsShell.tsx L45-L68.
// Each entry is a primary page an owner reaches from the sidebar.
// Order matches the sidebar; kept in sync manually.
const SIDEBAR = [
  { href: '/dashboard',     label: 'Dashboard' },
  { href: '/ops/cash',      label: 'Money & Shift' },
  { href: '/ops/sales',     label: 'Sales' },
  { href: '/ops/inventory', label: 'Inventory' },
  { href: '/ops/expenses',  label: 'Expenses' },
  { href: '/ops/salaries',  label: 'Salaries' },
  { href: '/ops/staff',     label: 'Staff' },
  { href: '/ops/settings',  label: 'Settings' },
] as const;

test.describe('Sidebar smoke — owner can reach every primary page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'owner');
  });

  for (const { href, label } of SIDEBAR) {
    test(`owner reaches ${href} (${label})`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(e.message));

      await page.goto(href);

      // Client-side auth guards redirect unauthenticated users to
      // /login. Wait for that class of redirect to settle before
      // asserting on the final state.
      await page.waitForLoadState('networkidle');

      // Final URL must not be /login. We intentionally do NOT assert
      // HTTP 200 or a specific destination — several ops pages
      // legitimately redirect (e.g. /ops/settings -> /ops/settings/restaurant).
      await expect(page).not.toHaveURL(/\/login/);

      // Every ops page renders a heading via OpsHeader. This catches
      // the "page loaded, but the data fetch failed and nothing
      // rendered" failure mode, which a URL-only check would miss.
      await expect(page.getByRole('heading').first()).toBeVisible({
        timeout: 10_000,
      });

      // No console errors — catches React errors, hydration
      // mismatches, and failed fetch calls logged to the console.
      expect(errors, `console errors on ${href}`).toEqual([]);
    });
  }
});
