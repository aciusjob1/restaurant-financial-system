import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { loginAs, CREDS } from './helpers/auth';

const prisma = new PrismaClient();

const WAITER_USERNAME = 'e2e-waiter';
const WAITER_FULLNAME = 'E2E Waiter';

// 1000.00 total sales, no mobile, no other. Expected net cash for
// the waiter today is therefore exactly 1000.00, which is what the
// manager will approve.
const TEST_TOTAL_SALES = '1000.00';

function todayISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
}

function todayUtcDate(): Date {
  return new Date(`${todayISO()}T00:00:00.000Z`);
}

// Deletes only rows for the E2E waiter on today's date. The waiter
// is a test-only user; nothing real can be affected.
async function cleanupWaiterCashForToday(): Promise<void> {
  const waiter = await prisma.user.findUnique({ where: { username: WAITER_USERNAME } });
  if (!waiter) return;
  const businessDate = todayUtcDate();

  await prisma.dailyCashReceiptDecision.deleteMany({
    where: { receipt: { userId: waiter.id, businessDate } },
  });
  await prisma.dailyCashReceipt.deleteMany({
    where: { userId: waiter.id, businessDate },
  });
  await prisma.collection.deleteMany({ where: { userId: waiter.id } });
  await prisma.shift.deleteMany({ where: { userId: waiter.id } });
  await prisma.salesSummary.deleteMany({
    where: { userId: waiter.id, businessDate },
  });
}

test.beforeAll(async () => {
  const businessDate = todayUtcDate();

  // The submission flow calls assertDayNotClosed, which rejects if a
  // DailyClosing exists for the date. We cannot test on a day that is
  // already closed, and we will not un-close a real closing. Fail
  // loudly so the operator knows why.
  const closing = await prisma.dailyClosing.findFirst({ where: { businessDate } });
  if (closing) {
    throw new Error(
      `[e2e] Today (${todayISO()}) is already closed. The cash test cannot ` +
      `run. Un-close the day via the UI, or wait until tomorrow and re-run.`
    );
  }

  await cleanupWaiterCashForToday();

  const waiter = await prisma.user.findUniqueOrThrow({ where: { username: WAITER_USERNAME } });
  const owner = await prisma.user.findUniqueOrThrow({ where: { username: CREDS.owner.username } });

  await prisma.salesSummary.create({
    data: {
      businessDate,
      source: 'MANUAL',
      sourceReference: '',
      totalSales: TEST_TOTAL_SALES,
      cashSales: TEST_TOTAL_SALES,
      mobileSales: '0.00',
      otherSales: '0.00',
      userId: waiter.id,
      enteredBy: owner.id,
    },
  });
});

test.afterAll(async () => {
  await cleanupWaiterCashForToday();
  await prisma.$disconnect();
});

test('manager records on behalf of a waiter and approves the receipt', async ({ page }) => {
  await loginAs(page, 'manager');
  await page.goto('/ops/cash');
  await page.waitForLoadState('networkidle');

  // The row for the E2E waiter renders with status "Awaiting submission".
  // We scope to a div that contains the waiter name; the row is a
  // rounded-2xl div (page.tsx L236). Playwright will match the smallest
  // ancestor that contains the name.
  const waiterRow = page
    .locator('div.rounded-2xl')
    .filter({ has: page.getByText(WAITER_FULLNAME, { exact: true }) })
    .first();
  await expect(waiterRow).toBeVisible({ timeout: 15_000 });
  await expect(
    waiterRow.getByText(/awaiting submission/i)
  ).toBeVisible();

  // Click "Record on behalf". This opens the WaiterCollectionForm modal.
  await waiterRow.getByRole('button', { name: /record on behalf/i }).click();

  // The modal shows the read-only total sales and a submit button.
  // We submit with no M-Pesa rows filled, which leaves the net cash
  // equal to the total (1000.00). The backend records the submission
  // and calls markSubmissionPending, creating a PENDING DailyCashReceipt.
  const modal = page.locator('div.fixed.inset-0').first();
  await expect(modal).toBeVisible({ timeout: 10_000 });
  // The modal renders the total sales twice: once as the read-only
  // header, once as the net cash summary at the bottom. Both are
  // 1000.00 when no M-Pesa rows are filled. Assert the first.
  await expect(modal.getByText(TEST_TOTAL_SALES).first()).toBeVisible();
  await modal.getByRole('button', { name: /submit report/i }).click();

  // After the modal closes and the page reloads, the row now shows
  // "Pending review" and the Approve button appears.
  await expect(
    waiterRow.getByText(/pending review/i)
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    waiterRow.getByRole('button', { name: /^approve$/i })
  ).toBeVisible();

  // Click Approve. The backend computes expectedNet (1000.00), matches
  // it against amountReceived (null -> expectedNet), and transitions
  // the receipt to APPROVED.
  await waiterRow.getByRole('button', { name: /^approve$/i }).click();

  // The row now shows "Approved".
  await expect(
    waiterRow.getByText(/^approved$/i)
  ).toBeVisible({ timeout: 15_000 });
});