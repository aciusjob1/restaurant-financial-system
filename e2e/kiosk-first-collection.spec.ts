import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Shared E2E waiter — provisioned by e2e/global-setup.ts. Do not create or
// delete this user in the spec; only clean up the business data it produces.
const WAITER = {
  username: 'e2e-waiter',
  password: 'E2eWaiter!234',
};

// Deletes only the business data belonging to the E2E waiter. The user row
// itself must survive — other specs depend on it.
async function cleanupWaiterData() {
  const u = await prisma.user.findUnique({ where: { username: WAITER.username } });
  if (!u) return;
  await prisma.collection.deleteMany({ where: { userId: u.id } });
  await prisma.reconciliation.deleteMany({ where: { userId: u.id } });
  await prisma.cashHandover.deleteMany({ where: { fromUserId: u.id } });
  await prisma.shift.deleteMany({ where: { userId: u.id } });
  await prisma.session.deleteMany({ where: { userId: u.id } });
}

test.beforeAll(async () => {
  await cleanupWaiterData();
});

test.afterAll(async () => {
  await cleanupWaiterData();
  await prisma.$disconnect();
});

test('waiter with no shift records a collection and the shift auto-opens', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/username/i).fill(WAITER.username);
  await page.getByLabel(/^password$/i).fill(WAITER.password);
  await page.getByRole('button', { name: /sign in|ingia/i }).click();

  // Lands on /kiosk and shows the no-shift notice.
  await expect(page).toHaveURL(/\/kiosk/, { timeout: 15_000 });
  await expect(
    page.getByText('Nothing recorded yet today. Your first collection opens your shift automatically.')
  ).toBeVisible({ timeout: 15_000 });

  // The shift-open header must NOT be present yet.
  await expect(page.getByText('Shift open', { exact: true })).toHaveCount(0);

  // Fill and submit the collection form.
  await page.getByLabel(/amount/i).fill('500.00');
  await page.getByRole('button', { name: 'Add collection' }).click();

  // The page reloads; shift header now appears.
  await expect(page.getByText('Shift open', { exact: true })).toBeVisible({ timeout: 15_000 });

  // The collection we just added is listed.
  await expect(page.getByRole('cell', { name: '500.00' })).toBeVisible();
});
