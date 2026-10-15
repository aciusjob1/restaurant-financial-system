import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { loginAs, CREDS } from './helpers/auth';

const prisma = new PrismaClient();

const WAITER_USERNAME = 'e2e-waiter';

function todayISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
}

// Deletes only business data owned by the e2e-waiter user. The user
// row itself is provisioned by global-setup.ts and must survive —
// other specs depend on it. Because e2e-waiter is a test-only account,
// this cannot touch real restaurant data.
async function cleanupWaiterData(): Promise<void> {
  const u = await prisma.user.findUnique({ where: { username: WAITER_USERNAME } });
  if (!u) return;
  await prisma.dailyCashReceipt.deleteMany({ where: { userId: u.id } });
  await prisma.salesSummary.deleteMany({ where: { userId: u.id } });
  await prisma.collection.deleteMany({ where: { userId: u.id } });
  await prisma.reconciliation.deleteMany({ where: { userId: u.id } });
  await prisma.cashHandover.deleteMany({ where: { fromUserId: u.id } });
  await prisma.shift.deleteMany({ where: { userId: u.id } });
  await prisma.session.deleteMany({ where: { userId: u.id } });
}

test.beforeAll(async () => {
  await cleanupWaiterData();

  // Seed a sales summary for the waiter so the kiosk renders the form
  // rather than the "sales not entered yet" screen. A manager normally
  // creates this via /ops/sales; we write it directly here to keep the
  // test focused on the kiosk submission flow, not on sales entry.
  const waiter = await prisma.user.findUniqueOrThrow({
    where: { username: WAITER_USERNAME },
  });
  const manager = await prisma.user.findUniqueOrThrow({
    where: { username: CREDS.manager.username },
  });

  const businessDate = new Date(`${todayISO()}T00:00:00.000Z`);

  await prisma.salesSummary.create({
    data: {
      businessDate,
      source: 'MANUAL',
      sourceReference: '',
      totalSales: '1000.00',
      cashSales: '1000.00',
      mobileSales: '0.00',
      otherSales: '0.00',
      userId: waiter.id,
      enteredBy: manager.id,
    },
  });
});

test.afterAll(async () => {
  await cleanupWaiterData();
  await prisma.$disconnect();
});

test('waiter submits today\u2019s receipt from the kiosk', async ({ page }) => {
  await loginAs(page, 'waiter');

  // Form is rendered (sales summary exists for today).
  await expect(
    page.getByText(/Total sales \(entered by your supervisor\)/i)
  ).toBeVisible({ timeout: 15_000 });

  // Fill one M-Pesa row. The name input uses the mpesaNamePlaceholder
  // ('e.g. Amina'); the amount input uses '0.00'. There is exactly one
  // row by default, so .first() is unambiguous.
  await page.getByPlaceholder(/Amina/i).fill('Juma');
  await page.getByPlaceholder('0.00').first().fill('500');

  // Submit.
  await page.getByRole('button', { name: /Submit report/i }).click();

  // Receipt renders with PENDING status, and the M-Pesa row we
  // submitted is listed on it.
  await expect(page.getByText(/What you submitted/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Pending manager review/i)).toBeVisible();
  await expect(page.getByRole('cell', { name: '500.00' })).toBeVisible();
});