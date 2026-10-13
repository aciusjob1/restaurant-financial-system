import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import argon2 from 'argon2';
import { prisma } from '../src/lib/prisma.js';
import { createManualSummary } from '../src/services/salesService.js';

const WAITER = {
  username: 'daily-report-waiter',
  password: 'DailyReportWaiter!234',
  fullName: 'Daily Report Waiter',
};

const OTHER_WAITER = {
  username: 'daily-report-waiter-other',
  password: 'DailyReportWaiter!234',
  fullName: 'Daily Report Other',
};

async function cleanup() {
  const names = [WAITER.username, OTHER_WAITER.username];
  const users = await prisma.user.findMany({ where: { username: { in: names } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  if (userIds.length) {
    // Order: expenses -> summary lines -> summary -> shifts -> sessions -> user
    await prisma.expense.deleteMany({ where: { createdBy: { in: userIds } } });
    const summaries = await prisma.salesSummary.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const sids = summaries.map((s) => s.id);
    if (sids.length) {
      await prisma.salesSummaryLine.deleteMany({ where: { salesSummaryId: { in: sids } } });
      await prisma.salesSummary.deleteMany({ where: { id: { in: sids } } });
    }
    await prisma.shift.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

function today(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}

let waiterId: string;
let otherWaiterId: string;

beforeAll(async () => {
  await cleanup();
  const w = await prisma.user.create({
    data: {
      username: WAITER.username,
      fullName: WAITER.fullName,
      role: 'WAITER',
      passwordHash: await argon2.hash(WAITER.password, { type: argon2.argon2id }),
      isActive: true,
    },
  });
  waiterId = w.id;
  const ow = await prisma.user.create({
    data: {
      username: OTHER_WAITER.username,
      fullName: OTHER_WAITER.fullName,
      role: 'WAITER',
      passwordHash: await argon2.hash(OTHER_WAITER.password, { type: argon2.argon2id }),
      isActive: true,
    },
  });
  otherWaiterId = ow.id;
});

afterAll(async () => {
  try { await cleanup(); } catch (e) { console.error('[dailyReport teardown]', e); }
});

beforeEach(async () => {
  // Each test starts from empty state for these users on today.
  await prisma.expense.deleteMany({ where: { createdBy: { in: [waiterId, otherWaiterId] } } });
  const summaries = await prisma.salesSummary.findMany({ where: { userId: { in: [waiterId, otherWaiterId] } }, select: { id: true } });
  const sids = summaries.map((s) => s.id);
  if (sids.length) {
    await prisma.salesSummaryLine.deleteMany({ where: { salesSummaryId: { in: sids } } });
    await prisma.salesSummary.deleteMany({ where: { id: { in: sids } } });
  }
});

describe('Daily report — createManualSummary extensions', () => {
  it('happy path: totalSales override + M-Pesa lines + expense rows', async () => {
    const summary = await createManualSummary({
      businessDate: today(),
      sourceReference: '',
      userId: waiterId,
      notes: null,
      lines: [
        { paymentMethod: 'MPESA', amount: '5000.00', notes: 'Amina' },
        { paymentMethod: 'MPESA', amount: '3000.00', notes: 'Juma' },
      ],
      totalSales: '50000.00',
      expenseRows: [
        { description: 'Fuel', amount: '2000.00' },
        { description: 'Ice', amount: '1500.00' },
      ],
      enteredBy: waiterId,
      actorRole: 'WAITER',
    });

    expect(summary.totalSales).toBe('50000.00');
    expect(summary.mobileSales).toBe('8000.00');
    expect(summary.cashSales).toBe('42000.00');

    const lines = await prisma.salesSummaryLine.findMany({ where: { salesSummaryId: summary.id } });
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.notes).sort()).toEqual(['Amina', 'Juma']);

    const expenses = await prisma.expense.findMany({
      where: { businessDate: new Date(today()), createdBy: waiterId, voidedAt: null },
    });
    expect(expenses).toHaveLength(2);
    expect(expenses.every((e) => e.status === 'APPROVED')).toBe(true);
    expect(expenses.map((e) => e.description).sort()).toEqual(['Fuel', 'Ice']);
  });

  it('zero M-Pesa lines with totalSales + expenses', async () => {
    const summary = await createManualSummary({
      businessDate: today(),
      sourceReference: '',
      userId: waiterId,
      notes: null,
      lines: [],
      totalSales: '12000.00',
      expenseRows: [{ description: 'Transport', amount: '500.00' }],
      enteredBy: waiterId,
      actorRole: 'WAITER',
    });
    expect(summary.totalSales).toBe('12000.00');
    expect(summary.mobileSales).toBe('0.00');
    expect(summary.cashSales).toBe('12000.00');

    const expenses = await prisma.expense.findMany({ where: { createdBy: waiterId, voidedAt: null } });
    expect(expenses).toHaveLength(1);
  });

  it('resubmission replaces lines and supersedes prior DAILY expenses', async () => {
    const d = today();

    await createManualSummary({
      businessDate: d,
      sourceReference: '',
      userId: waiterId,
      notes: null,
      lines: [{ paymentMethod: 'MPESA', amount: '1000.00', notes: 'First' }],
      totalSales: '10000.00',
      expenseRows: [{ description: 'OldExpense', amount: '500.00' }],
      enteredBy: waiterId,
      actorRole: 'WAITER',
    });

    const summary2 = await createManualSummary({
      businessDate: d,
      sourceReference: '',
      userId: waiterId,
      notes: null,
      lines: [{ paymentMethod: 'MPESA', amount: '4000.00', notes: 'Second' }],
      totalSales: '20000.00',
      expenseRows: [{ description: 'NewExpense', amount: '1500.00' }],
      enteredBy: waiterId,
      actorRole: 'WAITER',
    });

    expect(summary2.totalSales).toBe('20000.00');

    const activeExpenses = await prisma.expense.findMany({ where: { createdBy: waiterId, voidedAt: null } });
    expect(activeExpenses).toHaveLength(1);
    expect(activeExpenses[0].description).toBe('NewExpense');

    const voidedExpenses = await prisma.expense.findMany({ where: { createdBy: waiterId, voidedAt: { not: null } } });
    expect(voidedExpenses).toHaveLength(1);
    expect(voidedExpenses[0].description).toBe('OldExpense');
    expect(voidedExpenses[0].status).toBe('VOID');

    const lines = await prisma.salesSummaryLine.findMany({ where: { salesSummaryId: summary2.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0].notes).toBe('Second');
  });

  it('resubmission does not void another waiter\'s DAILY expenses', async () => {
    const d = today();

    // Other waiter submits their report.
    await createManualSummary({
      businessDate: d,
      sourceReference: '',
      userId: otherWaiterId,
      notes: null,
      lines: [],
      totalSales: '5000.00',
      expenseRows: [{ description: 'OtherWaiterExpense', amount: '200.00' }],
      enteredBy: otherWaiterId,
      actorRole: 'WAITER',
    });

    // Primary waiter submits, resubmits.
    await createManualSummary({
      businessDate: d,
      sourceReference: '',
      userId: waiterId,
      notes: null,
      lines: [],
      totalSales: '8000.00',
      expenseRows: [{ description: 'First', amount: '100.00' }],
      enteredBy: waiterId,
      actorRole: 'WAITER',
    });

    await createManualSummary({
      businessDate: d,
      sourceReference: '',
      userId: waiterId,
      notes: null,
      lines: [],
      totalSales: '9000.00',
      expenseRows: [{ description: 'Second', amount: '200.00' }],
      enteredBy: waiterId,
      actorRole: 'WAITER',
    });

    // Other waiter's expense must still be active.
    const otherActive = await prisma.expense.findMany({ where: { createdBy: otherWaiterId, voidedAt: null } });
    expect(otherActive).toHaveLength(1);
    expect(otherActive[0].description).toBe('OtherWaiterExpense');
  });

  it('resubmission voids every active expense for the actor, regardless of category', async () => {
    const d = today();

    // Create a one-off category and a manual expense on it.
    const customCat = await prisma.expenseCategory.create({
      data: { name: `Test Cat ${Date.now()}`, systemKey: null, isActive: true },
    });
    const customExpense = await prisma.expense.create({
      data: {
        expenseNumber: `TEST-${Date.now()}`,
        businessDate: new Date(d),
        categoryId: customCat.id,
        createdBy: waiterId,
        amount: '777.00',
        paymentMethod: 'CASH',
        description: 'Not a daily-report expense',
        status: 'APPROVED',
      },
    });

    try {
      // Submit a daily report. This voids every active expense for this
      // actor on this business date, regardless of category, then creates
      // the new rows. The prior custom-category expense is superseded
      // along with any DAILY rows.
      await createManualSummary({
        businessDate: d,
        sourceReference: '',
        userId: waiterId,
        notes: null,
        lines: [],
        totalSales: '5000.00',
        expenseRows: [{ description: 'Daily', amount: '100.00' }],
        enteredBy: waiterId,
        actorRole: 'WAITER',
      });

      const afterSubmit = await prisma.expense.findUnique({ where: { id: customExpense.id } });
      expect(afterSubmit).not.toBeNull();
      expect(afterSubmit!.voidedAt).not.toBeNull();
      expect(afterSubmit!.status).toBe('VOID');
    } finally {
      // Cleanup custom category's expense first, then the category.
      await prisma.expense.deleteMany({ where: { categoryId: customCat.id } });
      await prisma.expenseCategory.delete({ where: { id: customCat.id } });
    }
  });

  it('legacy callers (no totalSales, no expenseRows) behave unchanged', async () => {
    const summary = await createManualSummary({
      businessDate: today(),
      sourceReference: '',
      userId: waiterId,
      notes: null,
      lines: [
        { paymentMethod: 'CASH', amount: '3000.00' },
        { paymentMethod: 'MPESA', amount: '2000.00' },
      ],
      enteredBy: waiterId,
      actorRole: 'WAITER',
    });
    expect(summary.totalSales).toBe('5000.00');
    expect(summary.cashSales).toBe('3000.00');
    expect(summary.mobileSales).toBe('2000.00');

    // No expenses should have been created.
    const expenses = await prisma.expense.findMany({ where: { createdBy: waiterId } });
    expect(expenses).toHaveLength(0);
  });
});