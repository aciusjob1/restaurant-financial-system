import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { loginAs, CREDS } from './helpers/auth';

const prisma = new PrismaClient();

const TEST_CATEGORY_NAME = 'E2E Test Category';
const TEST_MATERIAL_NAME = 'E2E Test Material';
const TEST_MATERIAL_NUMBER = 'E2E-MAT-001';
const TEST_QUANTITY = '100.000';
const TEST_DATE = '2099-12-01';

// Cleanup is scoped to the E2E category by its unique name. Deleting
// the category (with materials) touches only rows created by this
// spec. Stock movements for the test material are removed first,
// because StockMovement.materialId has onDelete: Restrict.
async function cleanupTestFixtures(): Promise<void> {
  const category = await prisma.materialCategory.findUnique({
    where: { name: TEST_CATEGORY_NAME },
  });
  if (category) {
    // Delete movements first (Restrict on material FK).
    const mats = await prisma.material.findMany({
      where: { categoryId: category.id },
      select: { id: true },
    });
    for (const m of mats) {
      await prisma.stockMovement.deleteMany({ where: { materialId: m.id } });
    }
    await prisma.material.deleteMany({ where: { categoryId: category.id } });
    await prisma.materialCategory.delete({ where: { id: category.id } });
  }
}

test.beforeAll(async () => {
  await cleanupTestFixtures();

  const owner = await prisma.user.findUniqueOrThrow({
    where: { username: CREDS.owner.username },
  });

  const category = await prisma.materialCategory.create({
    data: {
      name: TEST_CATEGORY_NAME,
      createdBy: owner.id,
    },
  });

  await prisma.material.create({
    data: {
      materialNumber: TEST_MATERIAL_NUMBER,
      name: TEST_MATERIAL_NAME,
      categoryId: category.id,
      unit: 'kg',
      currentPrice: '100.00',
      minimumStock: '0.00',
      currentStock: '0.000',
      isActive: true,
      createdBy: owner.id,
    },
  });
});

test.afterAll(async () => {
  await cleanupTestFixtures();
  await prisma.$disconnect();
});

test('manager records a stock movement and the usage table reflects it', async ({ page }) => {
  await loginAs(page, 'manager');
  await page.goto('/ops/inventory');
  await page.waitForLoadState('networkidle');

  // The Record stock movement section is closed by default. Its
  // header is a <button> wrapping an <h2> (CollapsibleSection at
  // page.tsx L186). Clicking it toggles the section open.
  await page.getByRole('button', { name: 'Record stock movement' }).click();

  // The form is now visible. It has three selects in DOM order:
  // material, type, direction. Type defaults to OPENING and
  // direction to IN, which is what we want for adding stock.
  const form = page.locator('form').filter({ has: page.getByText(/quantity/i) }).first();
  await form.locator('select').first().selectOption({ label: TEST_MATERIAL_NAME });

  // The business date defaults to today — but we need the movement on
  // a date the usage monitor will show. The usage monitor defaults to
  // daily + today. Since the form also defaults to today, and the
  // movement is dated today, the usage table (daily/today) will
  // include it.
  await form.getByLabel(/quantity/i).fill(TEST_QUANTITY);

  // Submit.
  await form.getByRole('button', { name: 'Record movement' }).click();

  // Wait for the POST to settle. The form shows a flash on success
  // and calls loadValuationAndFixtures, but does NOT re-fetch the
  // usage monitor. Reload the page so the usage table picks up the
  // newly recorded movement.
  await page.waitForLoadState('networkidle');
  await page.reload();
  await page.waitForLoadState('networkidle');

  // The usage table is the first open section (default). Its rows
  // have the material name in the first cell.
  const usageRow = page.getByRole('row').filter({ hasText: TEST_MATERIAL_NAME });
  await expect(usageRow.first()).toBeVisible({ timeout: 15_000 });

  // For an OPENING/IN movement, the value lands in the
  // openingEntriesNet column (index 5, 0-based, in the usage table —
  // see page.tsx L648-L660 for the column order: material, category,
  // unit, opening, purchasesNet, openingEntriesNet, consumed, wasted,
  // adjustedNet, closing, currentStock, variance, estValue).
  // Strict-mode getByText would match 3 cells (opening, openingEntriesNet,
  // closing all render 100.000 for this simple case), so we target the
  // specific column.
  const openingEntriesCell = usageRow.first().getByRole('cell').nth(5);
  await expect(openingEntriesCell).toHaveText(TEST_QUANTITY);
});