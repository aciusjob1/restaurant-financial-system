import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import argon2 from 'argon2';
import { prisma } from '../src/lib/prisma.js';
import { createManualSummary, submitWaiterCollections } from '../src/services/salesService.js';
import {
  applySalaryExpense,
  approveSalaryRecord,
  createSalaryRecord,
} from '../src/services/salaryService.js';
import { toDecimal } from '../src/utils/money.js';

const PREFIX = 'kiosk-sal-';

const OWNER = { username: `${PREFIX}owner`, password: 'KioskSalary!234', fullName: 'Kiosk Salary Owner' };
const MANAGER = { username: `${PREFIX}manager`, password: 'KioskSalary!234', fullName: 'Kiosk Salary Manager' };

let ownerId: string;
let managerId: string;
let positionId: string;
let salaryCategoryId: string;

type Scenario = {
  waiterId: string;
  employeeId: string;
  summaryId: string;
  salaryRecordId: string;
  businessDate: string;
};

async function makeUser(username: string, fullName: string, role: 'OWNER' | 'MANAGER' | 'WAITER') {
  return prisma.user.create({
    data: {
      username,
      fullName,
      role,
      passwordHash: await argon2.hash('KioskSalary!234', { type: argon2.argon2id }),
      isActive: true,
    },
  });
}

/**
 * Builds an isolated waiter + employee + approved salary record + daily
 * summary. Each test gets its own employee so SalaryAdvance settlement from
 * one test can never leak into another.
 */
async function seedScenario(opts: {
  key: string;
  businessDate: string;
  periodStart: string;
  periodEnd: string;
  net: string;
}): Promise<Scenario> {
  const waiter = await makeUser(
    `${PREFIX}${opts.key}-waiter`,
    `Kiosk Salary Waiter ${opts.key}`,
    'WAITER'
  );
  const employee = await prisma.employee.create({
    data: {
      employeeNumber: `EMP-${PREFIX}${opts.key}-${Date.now()}`,
      fullName: `Kiosk Salary Employee ${opts.key}`,
      positionId,
      userId: waiter.id,
      startDate: new Date('2099-01-01T00:00:00.000Z'),
      isActive: true,
    },
  });

  const record = await createSalaryRecord({
    actor: { id: managerId, role: 'MANAGER' },
    employeeId: employee.id,
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    label: `Kiosk salary ${opts.key}`,
    baseSalary: opts.net,
  });
  await approveSalaryRecord({ id: record.id, actor: { id: ownerId, role: 'OWNER' } });

  const summary = await createManualSummary({
    businessDate: opts.businessDate,
    sourceReference: '',
    userId: waiter.id,
    notes: null,
    lines: [],
    totalSales: '50000.00',
    enteredBy: waiter.id,
    actorRole: 'WAITER',
  });

  return {
    waiterId: waiter.id,
    employeeId: employee.id,
    summaryId: summary.id,
    salaryRecordId: record.id,
    businessDate: opts.businessDate,
  };
}

function submitSalary(
  s: Scenario,
  amount: string,
  overrides: { categoryId?: string; employeeId?: string; actorId?: string; actorRole?: 'WAITER' | 'MANAGER' } = {}
) {
  return submitWaiterCollections({
    summaryId: s.summaryId,
    actorId: overrides.actorId ?? s.waiterId,
    actorRole: overrides.actorRole ?? 'WAITER',
    mpesaEntries: [],
    expenses: [
      {
        categoryId: overrides.categoryId ?? salaryCategoryId,
        description: 'Salary payout from kiosk',
        amount,
        salaryTargetEmployeeId: overrides.employeeId ?? s.employeeId,
      },
    ],
  });
}

function firstExpenseId(result: { expenses: Array<{ id: string }> }): string {
  const row = result.expenses[0];
  if (!row) throw new Error('expected the kiosk submission to return one expense');
  return row.id;
}

async function cleanupAll() {
  const users = await prisma.user.findMany({
    where: { username: { startsWith: PREFIX } },
    select: { id: true },
  });
  const uids = users.map((u) => u.id);
  if (uids.length === 0) return;

  const employees = await prisma.employee.findMany({
    where: { userId: { in: uids } },
    select: { id: true },
  });
  const empIds = employees.map((e) => e.id);

  const records = await prisma.salaryRecord.findMany({
    where: { employeeId: { in: empIds } },
    select: { id: true },
  });
  const recordIds = records.map((r) => r.id);

  const receipts = await prisma.dailyCashReceipt.findMany({
    where: { userId: { in: uids } },
    select: { id: true },
  });
  const receiptIds = receipts.map((r) => r.id);
  if (receiptIds.length > 0) {
    await prisma.dailyCashReceiptDecision.deleteMany({ where: { receiptId: { in: receiptIds } } });
  }
  await prisma.dailyCashReceipt.deleteMany({ where: { userId: { in: uids } } });

  await prisma.salaryAdvance.deleteMany({ where: { employeeId: { in: empIds } } });
  await prisma.salaryPayment.deleteMany({ where: { salaryRecordId: { in: recordIds } } });
  await prisma.expense.deleteMany({
    where: { OR: [{ createdBy: { in: uids } }, { paidByUserId: { in: uids } }] },
  });

  const summaries = await prisma.salesSummary.findMany({
    where: { userId: { in: uids } },
    select: { id: true },
  });
  const summaryIds = summaries.map((s) => s.id);
  if (summaryIds.length > 0) {
    await prisma.salesSummaryLine.deleteMany({ where: { salesSummaryId: { in: summaryIds } } });
    await prisma.salesSummary.deleteMany({ where: { id: { in: summaryIds } } });
  }

  await prisma.salaryRecord.deleteMany({ where: { id: { in: recordIds } } });
  await prisma.collection.deleteMany({ where: { userId: { in: uids } } });
  await prisma.collection.deleteMany({ where: { createdById: { in: uids } } });
  await prisma.shift.deleteMany({ where: { userId: { in: uids } } });
  await prisma.session.deleteMany({ where: { userId: { in: uids } } });
  await prisma.employee.deleteMany({ where: { id: { in: empIds } } });
  await prisma.user.deleteMany({ where: { id: { in: uids } } });
}

beforeAll(async () => {
  await cleanupAll();

  const owner = await makeUser(OWNER.username, OWNER.fullName, 'OWNER');
  ownerId = owner.id;
  const manager = await makeUser(MANAGER.username, MANAGER.fullName, 'MANAGER');
  managerId = manager.id;

  const position = await prisma.position.create({
    data: { name: `Kiosk Salary Position ${Date.now()}`, defaultSalary: '500000.00' },
  });
  positionId = position.id;

  const salaryCat = await prisma.expenseCategory.findUnique({
    where: { systemKey: 'SALARY' },
    select: { id: true },
  });
  if (!salaryCat) throw new Error('SALARY expense category missing — run prisma:apply-raw-sql');
  salaryCategoryId = salaryCat.id;
});

afterAll(async () => {
  try {
    await cleanupAll();
    await prisma.position.deleteMany({ where: { id: positionId } });
  } catch (e) {
    console.error('[kioskSalary teardown]', e);
  }
});

describe('Kiosk salary expenses — validation', () => {
  it('requires salaryTargetEmployeeId on a SALARY row', async () => {
    const s = await seedScenario({
      key: 'no-target',
      businessDate: '2099-02-01',
      periodStart: '2099-01-01',
      periodEnd: '2099-01-31',
      net: '5000.00',
    });

    await expect(
      submitWaiterCollections({
        summaryId: s.summaryId,
        actorId: s.waiterId,
        actorRole: 'WAITER',
        mpesaEntries: [],
        expenses: [
          { categoryId: salaryCategoryId, description: 'Unlinked salary', amount: '1000.00' },
        ],
      })
    ).rejects.toMatchObject({ status: 400, code: 'EMPLOYEE_REQUIRED' });
  });

  it("refuses to pay another waiter's employee from the kiosk", async () => {
    const s = await seedScenario({
      key: 'cross-target',
      businessDate: '2099-02-02',
      periodStart: '2099-01-01',
      periodEnd: '2099-01-31',
      net: '5000.00',
    });
    const other = await seedScenario({
      key: 'cross-target-other',
      businessDate: '2099-02-02',
      periodStart: '2099-01-01',
      periodEnd: '2099-01-31',
      net: '3000.00',
    });

    await expect(submitSalary(s, '1000.00', { employeeId: other.employeeId }))
      .rejects.toMatchObject({ status: 403, code: 'SALARY_TARGET_FORBIDDEN' });
  });

  it('refuses salary entries when the attributed user is not a waiter', async () => {
    const s = await seedScenario({
      key: 'non-waiter',
      businessDate: '2099-02-03',
      periodStart: '2099-01-01',
      periodEnd: '2099-01-31',
      net: '5000.00',
    });
    // Attribution follows summary.userId, so point the summary at the manager.
    const managerSummary = await createManualSummary({
      businessDate: s.businessDate,
      sourceReference: '',
      userId: managerId,
      notes: null,
      lines: [],
      totalSales: '1000.00',
      enteredBy: managerId,
      actorRole: 'MANAGER',
    });

    await expect(
      submitWaiterCollections({
        summaryId: managerSummary.id,
        actorId: managerId,
        actorRole: 'MANAGER',
        mpesaEntries: [],
        expenses: [
          {
            categoryId: salaryCategoryId,
            description: 'Salary on a manager report',
            amount: '1000.00',
            salaryTargetEmployeeId: s.employeeId,
          },
        ],
      })
    ).rejects.toMatchObject({ status: 403, code: 'KIOSK_SALARY_WAITER_ONLY' });
  });

  it('rolls back the cash expense when the employee has no approved salary record', async () => {
    const s = await seedScenario({
      key: 'no-record',
      businessDate: '2099-02-04',
      periodStart: '2099-01-01',
      periodEnd: '2099-01-31',
      net: '5000.00',
    });
    // Revert the salary record to DRAFT so applySalaryExpense refuses it.
    await prisma.salaryRecord.update({
      where: { id: s.salaryRecordId },
      data: { status: 'DRAFT' },
    });

    await expect(submitSalary(s, '1000.00'))
      .rejects.toMatchObject({ status: 409, code: 'NO_SALARY_RECORD' });

    const leftovers = await prisma.expense.findMany({
      where: { createdBy: s.waiterId, businessDate: new Date(`${s.businessDate}T00:00:00.000Z`) },
    });
    expect(leftovers).toHaveLength(0);
  });
});

describe('Kiosk salary expenses — payroll effect', () => {
  it('links the expense to the SalaryPayment it creates (source KIOSK)', async () => {
    const s = await seedScenario({
      key: 'pay',
      businessDate: '2099-02-05',
      periodStart: '2099-01-01',
      periodEnd: '2099-01-31',
      net: '5000.00',
    });

    const result = await submitSalary(s, '5000.00');
    expect(result.expenses).toHaveLength(1);

    const expense = await prisma.expense.findUniqueOrThrow({
      where: { id: firstExpenseId(result) },
    });
    expect(expense.origin).toBe('KIOSK');
    expect(expense.paidByUserId).toBe(s.waiterId);
    expect(expense.salaryPaymentId).not.toBeNull();

    const payment = await prisma.salaryPayment.findUniqueOrThrow({
      where: { id: expense.salaryPaymentId! },
    });
    expect(payment.amount.toString()).toBe('5000');
    expect(payment.source).toBe('KIOSK');
    expect(payment.voidedAt).toBeNull();

    const record = await prisma.salaryRecord.findUniqueOrThrow({ where: { id: s.salaryRecordId } });
    expect(record.status).toBe('PAID');
  });

  it('rejects applying the same expense to payroll twice', async () => {
    const s = await seedScenario({
      key: 'double-apply',
      businessDate: '2099-02-06',
      periodStart: '2099-01-01',
      periodEnd: '2099-01-31',
      net: '5000.00',
    });

    const result = await submitSalary(s, '1000.00');
    const expenseId = firstExpenseId(result);

    await expect(
      prisma.$transaction((tx) =>
        applySalaryExpense(tx, {
          expenseId,
          employeeId: s.employeeId,
          amount: toDecimal('1000.00'),
          paymentMethod: 'CASH',
          businessDate: new Date(`${s.businessDate}T00:00:00.000Z`),
          recordedBy: s.waiterId,
          notes: null,
          source: 'KIOSK',
        })
      )
    ).rejects.toMatchObject({ status: 409, code: 'SALARY_EXPENSE_ALREADY_APPLIED' });
  });

  it('resubmission reverses the prior payment and re-links the new expense', async () => {
    const s = await seedScenario({
      key: 'resubmit',
      businessDate: '2099-02-07',
      periodStart: '2099-01-01',
      periodEnd: '2099-01-31',
      net: '5000.00',
    });

    const first = await submitSalary(s, '5000.00');
    const firstExpense = await prisma.expense.findUniqueOrThrow({ where: { id: firstExpenseId(first) } });
    const firstPaymentId = firstExpense.salaryPaymentId!;

    await submitSalary(s, '2000.00');

    const oldPayment = await prisma.salaryPayment.findUniqueOrThrow({ where: { id: firstPaymentId } });
    expect(oldPayment.voidedAt).not.toBeNull();
    const oldExpense = await prisma.expense.findUniqueOrThrow({ where: { id: firstExpense.id } });
    expect(oldExpense.voidedAt).not.toBeNull();

    const active = await prisma.expense.findMany({
      where: {
        businessDate: new Date(`${s.businessDate}T00:00:00.000Z`),
        origin: 'KIOSK',
        paidByUserId: s.waiterId,
        voidedAt: null,
      },
    });
    expect(active).toHaveLength(1);
    const newExpense = active[0]!;
    expect(newExpense.amount.toString()).toBe('2000');
    expect(newExpense.salaryPaymentId).not.toBeNull();

    const newPayment = await prisma.salaryPayment.findUniqueOrThrow({
      where: { id: newExpense.salaryPaymentId! },
    });
    expect(newPayment.amount.toString()).toBe('2000');
    expect(newPayment.source).toBe('KIOSK');
    expect(newPayment.voidedAt).toBeNull();

    const record = await prisma.salaryRecord.findUniqueOrThrow({ where: { id: s.salaryRecordId } });
    expect(record.status).toBe('APPROVED');
  });

  it('overpayment records an advance and resubmission voids it', async () => {
    const s = await seedScenario({
      key: 'advance',
      businessDate: '2099-02-08',
      periodStart: '2099-01-01',
      periodEnd: '2099-01-31',
      net: '5000.00',
    });

    const first = await submitSalary(s, '6000.00');
    const firstExpense = await prisma.expense.findUniqueOrThrow({ where: { id: firstExpenseId(first) } });
    expect(firstExpense.salaryPaymentId).not.toBeNull();

    const advance = await prisma.salaryAdvance.findFirstOrThrow({
      where: { expenseId: firstExpense.id },
    });
    expect(advance.amount.toString()).toBe('1000');
    expect(advance.source).toBe('KIOSK');
    expect(advance.voidedAt).toBeNull();
    expect(advance.settledAt).toBeNull();

    const record = await prisma.salaryRecord.findUniqueOrThrow({ where: { id: s.salaryRecordId } });
    expect(record.status).toBe('PAID');

    await submitSalary(s, '6000.00');

    const voidedAdvance = await prisma.salaryAdvance.findUniqueOrThrow({ where: { id: advance.id } });
    expect(voidedAdvance.voidedAt).not.toBeNull();

    const activeAdvance = await prisma.salaryAdvance.findFirstOrThrow({
      where: { employeeId: s.employeeId, voidedAt: null },
    });
    expect(activeAdvance.amount.toString()).toBe('1000');
    expect(activeAdvance.id).not.toBe(advance.id);
  });

  it('blocks resubmission once the advance has been settled into a salary record', async () => {
    const s = await seedScenario({
      key: 'settled',
      businessDate: '2099-02-09',
      periodStart: '2099-01-01',
      periodEnd: '2099-01-31',
      net: '5000.00',
    });

    const first = await submitSalary(s, '6000.00');
    const firstExpenseIdValue = firstExpenseId(first);

    // A new record absorbs the unsettled KSh 1,000 advance, so the kiosk
    // entry can no longer be cleanly reversed.
    await createSalaryRecord({
      actor: { id: managerId, role: 'MANAGER' },
      employeeId: s.employeeId,
      periodStart: '2099-03-01',
      periodEnd: '2099-03-31',
      label: 'Next period absorbs the advance',
      baseSalary: '5000.00',
    });

    await expect(submitSalary(s, '6000.00'))
      .rejects.toMatchObject({ status: 409, code: 'ADVANCE_SETTLED' });

    const unchanged = await prisma.expense.findUniqueOrThrow({ where: { id: firstExpenseIdValue } });
    expect(unchanged.voidedAt).toBeNull();
    expect(unchanged.salaryPaymentId).not.toBeNull();

    const payment = await prisma.salaryPayment.findUniqueOrThrow({
      where: { id: unchanged.salaryPaymentId! },
    });
    expect(payment.voidedAt).toBeNull();
  });
});
