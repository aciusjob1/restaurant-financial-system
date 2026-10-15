import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { loginAs, CREDS } from './helpers/auth';

const prisma = new PrismaClient();

// A dedicated employee for this spec. Created in beforeAll, torn down
// in afterAll. Named uniquely so it cannot collide with anything the
// user has created.
const TEST_EMPLOYEE_FULLNAME = 'E2E Salary Employee';
const TEST_EMPLOYEE_NUMBER = 'E2E-SAL-001';
const TEST_ADVANCE_AMOUNT = '250.00';

// Unique period per run. The month varies with the real current month
// so consecutive runs use different windows against real payroll, and
// the fixed far-future year guarantees no collision with historical
// data. The `offset` parameter shifts the month by N so two records
// for the same employee do not overlap — the service rejects
// overlapping periods with PERIOD_OVERLAP.
function testPeriod(offset = 0): { start: string; end: string; label: string } {
  const now = new Date();
  const y = 2099;
  const totalMonth = now.getMonth() + offset;
  const m = String(((totalMonth % 12) + 12) % 12 + 1).padStart(2, '0');
  const start = `${y}-${m}-01`;
  const end = `${y}-${m}-28`;
  const label = `E2E test ${y}-${m}`;
  return { start, end, label };
}

async function cleanupTestEmployee(): Promise<void> {
  const emp = await prisma.employee.findFirst({
    where: { fullName: TEST_EMPLOYEE_FULLNAME },
  });
  if (!emp) return;

  // Order respects FKs:
  //   SalaryAdvance.employeeId   -> Restrict -> must go before employee
  //   SalaryPayment.salaryRecordId -> child of SalaryRecord
  //   SalaryRecord.employeeId    -> Restrict -> must go before employee
  await prisma.salaryAdvance.deleteMany({ where: { employeeId: emp.id } });
  await prisma.salaryPayment.deleteMany({
    where: { salaryRecord: { employeeId: emp.id } },
  });
  await prisma.salaryRecord.deleteMany({ where: { employeeId: emp.id } });
  await prisma.employee.delete({ where: { id: emp.id } });
}

test.beforeAll(async () => {
  await cleanupTestEmployee();

  const position = await prisma.position.findFirst({ where: { isActive: true } });
  if (!position) {
    throw new Error(
      '[e2e] No active Position exists. Salary tests require a seeded position.'
    );
  }

  const owner = await prisma.user.findUniqueOrThrow({
    where: { username: CREDS.owner.username },
  });

  // Create the test employee.
  const employee = await prisma.employee.create({
    data: {
      employeeNumber: TEST_EMPLOYEE_NUMBER,
      fullName: TEST_EMPLOYEE_FULLNAME,
      positionId: position.id,
      employmentStatus: 'ACTIVE',
      startDate: new Date('2025-01-01T00:00:00.000Z'),
      isActive: true,
    },
  });

  // Create a salary record for the test employee. This is the record
  // the settled-advances test will look for in the list. Created via
  // Prisma (not the API) so this test's setup is independent of the
  // creation form.
  const { start, end, label } = testPeriod();
  const record = await prisma.salaryRecord.create({
    data: {
      salaryNumber: 'SAL-E2E-' + Date.now().toString(36),
      employeeId: employee.id,
      periodStart: new Date(`${start}T00:00:00.000Z`),
      periodEnd: new Date(`${end}T00:00:00.000Z`),
      label,
      baseSalary: '1500.00',
      adjustments: '0.00',
      deductions: '0.00',
      netSalary: '1500.00',
      status: 'DRAFT',
      createdBy: owner.id,
    },
  });

  // Create a settled advance pointing at that record. This is the row
  // the settled-advances card should display.
  await prisma.salaryAdvance.create({
    data: {
      employeeId: employee.id,
      amount: TEST_ADVANCE_AMOUNT,
      businessDate: new Date('2025-01-15T00:00:00.000Z'),
      recordedBy: owner.id,
      settledById: record.id,
      settledAt: new Date('2025-01-20T00:00:00.000Z'),
    },
  });
});

test.afterAll(async () => {
  await cleanupTestEmployee();
  await prisma.$disconnect();
});

test('owner creates a salary record and it appears in the list', async ({ page }) => {
  // Offset by 1 month so this record does not overlap the one seeded
  // in beforeAll — the service rejects overlapping periods for the
  // same employee with PERIOD_OVERLAP.
  const { start, end, label } = testPeriod(1);

  await loginAs(page, 'owner');
  await page.goto('/ops/salaries');
  await page.waitForLoadState('networkidle');

  const form = page.locator('form').filter({ has: page.getByText(/New salary record|newHeading/i) });
  const employeeSelect = form.locator('select').first();
  await expect(employeeSelect).toBeVisible({ timeout: 10_000 });

  await employeeSelect.selectOption({ label: TEST_EMPLOYEE_FULLNAME });

  await page.getByLabel(/^label$/i).fill(label + ' fresh');
  await page.getByLabel(/period start/i).fill(start);
  await page.getByLabel(/period end/i).fill(end);
  await page.getByLabel(/base salary/i).fill('1500.00');

  await page.getByRole('button', { name: /create salary record/i }).click();

  await expect(page.getByText(label + ' fresh').first()).toBeVisible({ timeout: 15_000 });
});

// Verifies the settled-advances feature committed in 0af56bd renders
// correctly on the expanded salary row. The advance was seeded via
// Prisma in beforeAll, pointing at a real SalaryRecord for the test
// employee.
test('settled advances render on the expanded salary row', async ({ page }) => {
  const { label } = testPeriod();

  await loginAs(page, 'owner');
  await page.goto('/ops/salaries');
  await page.waitForLoadState('networkidle');

  // Find the row for our seeded record. Use the seeded label — it is
  // unique and appears in the "Label" column of the row.
  const row = page.getByRole('row').filter({ hasText: label });
  await expect(row.first()).toBeVisible({ timeout: 10_000 });

  // Expand it. The expand toggle is a <button> with aria-label
  // "Expand" (see salaries/page.tsx L285-L292).
  const expandBtn = row.first().getByRole('button', { name: 'Expand' });
  await expandBtn.click();

  // The settled-advances card must be present. Its heading comes from
  // ops.salaries.settledAdvanceHeading ('Settled advances').
  await expect(
    page.getByText('Settled advances', { exact: true })
  ).toBeVisible({ timeout: 10_000 });

  // The seeded advance amount must render. Note: the fresh record
  // created by the previous test has no advances, so this amount can
  // only come from the seeded record's card.
  // Substring match: the card renders `{businessDate} — {amount}` as
  // one text node, so exact-match on the amount alone would fail.
  await expect(page.getByText(/250\.00/)).toBeVisible();

  // The card also shows the absorbing salary number. We do not assert
  // the exact value, since it is generated — but we do assert the
  // "Absorbed by" label appears, which only renders inside the card.
  await expect(page.getByText(/Absorbed by/)).toBeVisible();
});