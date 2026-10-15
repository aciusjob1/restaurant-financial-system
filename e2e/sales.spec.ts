import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { loginAs } from './helpers/auth';

const prisma = new PrismaClient();

const WAITER_USERNAME = 'e2e-waiter';
const WAITER_FULLNAME = 'E2E Waiter';

// A fixed far-future date. The unique constraint on SalesSummary is
// [source, businessDate, sourceReference, userId], so re-runs against
// the same date would 409 unless cleaned. We clean in beforeAll and
// afterAll, so the date itself can be stable.
const TEST_DATE = '2099-11-20';
const TEST_AMOUNT = '5000.00';
const TEST_AMOUNT_ALT = '7500.00';

// Deletes only summaries for the e2e-waiter on the test date. Lines
// cascade, so this is a single operation. Because the waiter is a
// test-only user, this cannot touch real restaurant data.
async function cleanupWaiterSummaries(): Promise<void> {
  const waiter = await prisma.user.findUnique({ where: { username: WAITER_USERNAME } });
  if (!waiter) return;
  await prisma.salesSummary.deleteMany({
    where: {
      userId: waiter.id,
      businessDate: new Date(`${TEST_DATE}T00:00:00.000Z`),
    },
  });
}

test.beforeAll(async () => {
  await cleanupWaiterSummaries();
});

test.afterAll(async () => {
  await cleanupWaiterSummaries();
  await prisma.$disconnect();
});

test('manager records a waiter summary and it appears in the list', async ({ page }) => {
  await loginAs(page, 'manager');
  await page.goto('/ops/sales');
  await page.waitForLoadState('networkidle');

  // Set the table filter to the target date so the newly-created row
  // is visible after submit. This input is not label-associated; it
  // is the first date input on the page (the form's business date is
  // the second, and it renders inside the form above the filter row).
  const dateInputs = page.locator('input[type="date"]');
  await expect(dateInputs).toHaveCount(2, { timeout: 10_000 });
  await dateInputs.first().fill(TEST_DATE);

  // Wait for the filter's server round-trip to settle.
  await page.waitForLoadState('networkidle');

  // Fill the form. The waiter picker is a <SelectField>; its label
  // text is not reliably associated with the <select> element, so
  // select by position within the form (see salaries.spec.ts, where
  // the same pattern works for the employee picker).
  const form = page.locator('form').first();
  await form.locator('select').first().selectOption({ label: WAITER_FULLNAME });
  await dateInputs.nth(1).fill(TEST_DATE);
  await page.getByLabel(/^total sales$/i).fill(TEST_AMOUNT);

  // Submit.
  await page.getByRole('button', { name: /record sales summary/i }).click();

  // The new row is visible: a table row containing the amount and the
  // waiter's name.
  const row = page.getByRole('row').filter({ hasText: TEST_AMOUNT });
  await expect(row.first()).toBeVisible({ timeout: 15_000 });
  await expect(row.first().getByText(WAITER_FULLNAME)).toBeVisible();
});

test('duplicate submission shows conflict and Replace overwrites', async ({ page }) => {
  await loginAs(page, 'manager');
  await page.goto('/ops/sales');
  await page.waitForLoadState('networkidle');

  // Set the filter to the target date — the summary created by the
  // previous test is on this date.
  const dateInputs = page.locator('input[type="date"]');
  await expect(dateInputs).toHaveCount(2, { timeout: 10_000 });
  await dateInputs.first().fill(TEST_DATE);
  await page.waitForLoadState('networkidle');

  // Submit the same waiter+date with a different amount. Select by
  // position within the form — see comment in the first test.
  const form = page.locator('form').first();
  await form.locator('select').first().selectOption({ label: WAITER_FULLNAME });
  await dateInputs.nth(1).fill(TEST_DATE);
  await page.getByLabel(/^total sales$/i).fill(TEST_AMOUNT_ALT);
  await page.getByRole('button', { name: /record sales summary/i }).click();

  // The conflict modal appears. Its heading string is
  // ops.sales.conflict.heading ('Summary already exists').
  await expect(
    page.getByText('Summary already exists', { exact: true })
  ).toBeVisible({ timeout: 10_000 });

  // Click "Replace" — the string is ops.sales.conflict.confirm.
  await page.getByRole('button', { name: /^replace$/i }).click();

  // The row now shows the new amount.
  const row = page.getByRole('row').filter({ hasText: TEST_AMOUNT_ALT });
  await expect(row.first()).toBeVisible({ timeout: 15_000 });
});