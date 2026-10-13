import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import argon2 from 'argon2';
import { prisma } from '../src/lib/prisma.js';
import {
  createManualSummary,
  submitWaiterCollections,
} from '../src/services/salesService.js';

const WAITER = {
  username: 'wc-waiter',
  password: 'WaiterCollections!234',
  fullName: 'Waiter Collections Waiter',
};
const OTHER_WAITER = {
  username: 'wc-other-waiter',
  password: 'WaiterCollections!234',
  fullName: 'Waiter Collections Other',
};
const MANAGER = {
  username: 'wc-manager',
  password: 'ManagerCollections!234',
  fullName: 'Waiter Collections Manager',
};

function todayISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
}

let waiterId: string;
let otherWaiterId: string;
let managerId: string;
let dailyCategoryId: string;

async function cleanup() {
  const names = [WAITER.username, OTHER_WAITER.username, MANAGER.username];
  const users = await prisma.user.findMany({
    where: { username: { in: names } },
    select: { id: true },
  });
  const uids = users.map((u) => u.id);
  if (!uids.length) return;

  await prisma.dailyCashReceipt.deleteMany({ where: { userId: { in: uids } } });
  await prisma.collection.deleteMany({ where: { userId: { in: uids } } });
  await prisma.collection.deleteMany({ where: { createdById: { in: uids } } });
  await prisma.expense.deleteMany({ where: { createdBy: { in: uids } } });
  const summaries = await prisma.salesSummary.findMany({
    where: { userId: { in: uids } },
    select: { id: true },
  });
  const sids = summaries.map((s) => s.id);
  if (sids.length) {
    await prisma.salesSummaryLine.deleteMany({ where: { salesSummaryId: { in: sids } } });
    await prisma.salesSummary.deleteMany({ where: { id: { in: sids } } });
  }
  await prisma.shift.deleteMany({ where: { userId: { in: uids } } });
  await prisma.session.deleteMany({ where: { userId: { in: uids } } });
  await prisma.user.deleteMany({ where: { id: { in: uids } } });
}

async function makeUser(u: {
  username: string;
  password: string;
  fullName: string;
  role: 'WAITER' | 'MANAGER';
}) {
  return prisma.user.create({
    data: {
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      passwordHash: await argon2.hash(u.password, { type: argon2.argon2id }),
      isActive: true,
    },
  });
}

async function seedSummary(userId: string, totalSales = '50000.00') {
  return createManualSummary({
    businessDate: todayISO(),
    sourceReference: '',
    userId,
    notes: null,
    lines: [],
    totalSales,
    enteredBy: userId,
    actorRole: 'WAITER',
  });
}

beforeAll(async () => {
  await cleanup();
  const w = await makeUser({ ...WAITER, role: 'WAITER' });
  waiterId = w.id;
  const o = await makeUser({ ...OTHER_WAITER, role: 'WAITER' });
  otherWaiterId = o.id;
  const m = await makeUser({ ...MANAGER, role: 'MANAGER' });
  managerId = m.id;

  const dailyCat = await prisma.expenseCategory.findUnique({
    where: { systemKey: 'DAILY' },
    select: { id: true },
  });
  if (!dailyCat) throw new Error('DAILY expense category missing — run prisma:apply-raw-sql');
  dailyCategoryId = dailyCat.id;
});

afterAll(async () => {
  try {
    await cleanup();
  } catch (e) {
    console.error('[waiterCollections teardown]', e);
  }
});

beforeEach(async () => {
  const uids = [waiterId, otherWaiterId, managerId];
  await prisma.dailyCashReceipt.deleteMany({ where: { userId: { in: uids } } });
  await prisma.collection.deleteMany({ where: { userId: { in: uids } } });
  await prisma.collection.deleteMany({ where: { createdById: { in: uids } } });
  await prisma.expense.deleteMany({ where: { createdBy: { in: uids } } });
  const summaries = await prisma.salesSummary.findMany({
    where: { userId: { in: uids } },
    select: { id: true },
  });
  const sids = summaries.map((s) => s.id);
  if (sids.length) {
    await prisma.salesSummaryLine.deleteMany({ where: { salesSummaryId: { in: sids } } });
    await prisma.salesSummary.deleteMany({ where: { id: { in: sids } } });
  }
  await prisma.shift.deleteMany({ where: { userId: { in: uids } } });
});

describe('submitWaiterCollections', () => {
  it('creates Collection rows for M-Pesa and Expense rows, leaves SalesSummary untouched', async () => {
    const summary = await seedSummary(waiterId, '50000.00');

    const before = await prisma.salesSummary.findUniqueOrThrow({ where: { id: summary.id } });

    const result = await submitWaiterCollections({
      summaryId: summary.id,
      actorId: waiterId,
      actorRole: 'WAITER',
      mpesaEntries: [
        { payerName: 'Amina', amount: '5000.00' },
        { payerName: 'Juma', amount: '3000.00' },
      ],
      expenses: [
        { categoryId: dailyCategoryId, description: 'Fuel', amount: '2000.00' },
        { categoryId: dailyCategoryId, description: 'Ice', amount: '500.00' },
      ],
    });

    // Collection rows exist with the payer name in mobileReference
    const collections = await prisma.collection.findMany({
      where: { shiftId: { not: undefined }, userId: waiterId, voidedAt: null },
      orderBy: { mobileReference: 'asc' },
    });
    expect(collections).toHaveLength(2);
    expect(collections.map((c) => c.mobileReference)).toEqual(['Amina', 'Juma']);
    expect(collections.every((c) => c.paymentMethod === 'MPESA')).toBe(true);
    expect(collections.every((c) => c.createdById === waiterId)).toBe(true);

    // Response carries the created collections
    expect(result.collections).toHaveLength(2);
    expect(result.expenses).toHaveLength(2);

    // SalesSummary is byte-for-byte unchanged
    const after = await prisma.salesSummary.findUniqueOrThrow({ where: { id: summary.id } });
    expect(after.totalSales.toString()).toBe(before.totalSales.toString());
    expect(after.cashSales.toString()).toBe(before.cashSales.toString());
    expect(after.mobileSales.toString()).toBe(before.mobileSales.toString());
    expect(after.otherSales.toString()).toBe(before.otherSales.toString());

    // No SalesSummaryLine rows were written by this call
    const lines = await prisma.salesSummaryLine.findMany({ where: { salesSummaryId: summary.id } });
    expect(lines).toHaveLength(0);
  });

  it('same-actor resubmission voids own prior collections and replaces them', async () => {
    const summary = await seedSummary(waiterId, '50000.00');

    await submitWaiterCollections({
      summaryId: summary.id,
      actorId: waiterId,
      actorRole: 'WAITER',
      mpesaEntries: [{ payerName: 'Amina', amount: '5000.00' }],
      expenses: [{ categoryId: dailyCategoryId, description: 'First', amount: '100.00' }],
    });

    await submitWaiterCollections({
      summaryId: summary.id,
      actorId: waiterId,
      actorRole: 'WAITER',
      mpesaEntries: [
        { payerName: 'Amina', amount: '6000.00' },
        { payerName: 'Juma', amount: '2000.00' },
      ],
      expenses: [{ categoryId: dailyCategoryId, description: 'Second', amount: '200.00' }],
    });

    const active = await prisma.collection.findMany({
      where: { userId: waiterId, voidedAt: null },
      orderBy: { mobileReference: 'asc' },
    });
    expect(active).toHaveLength(2);
    expect(active.map((c) => c.mobileReference)).toEqual(['Amina', 'Juma']);
    expect(active.find((c) => c.mobileReference === 'Amina')!.amount.toString()).toBe('6000');

    const voided = await prisma.collection.findMany({
      where: { userId: waiterId, voidedAt: { not: null } },
    });
    expect(voided).toHaveLength(1);
    expect(voided[0].mobileReference).toBe('Amina');
    expect(voided[0].amount.toString()).toBe('5000');

    // Expenses: prior superseded, one active
    const activeExp = await prisma.expense.findMany({
      where: { createdBy: waiterId, voidedAt: null },
    });
    expect(activeExp).toHaveLength(1);
    expect(activeExp[0].description).toBe('Second');
  });

  it('cross-actor conflict returns 409 CONFLICT_WITH_OTHER_ACTOR and leaves the other actor row intact', async () => {
    const summary = await seedSummary(waiterId, '50000.00');

    // Auto-open the shift once so the manager's collection lands on the same shift the waiter will use.
    const first = await submitWaiterCollections({
      summaryId: summary.id,
      actorId: waiterId,
      actorRole: 'WAITER',
      mpesaEntries: [{ payerName: 'Placeholder', amount: '1.00' }],
      expenses: [],
    });
    expect(first.collections).toHaveLength(1);

    // Find the shift and seed a manager-created collection directly on it.
    const shift = await prisma.shift.findFirstOrThrow({
      where: { userId: waiterId, businessDate: new Date(todayISO()) },
    });

    await prisma.collection.create({
      data: {
        shiftId: shift.id,
        userId: waiterId,
        createdById: managerId,
        paymentMethod: 'MPESA',
        amount: '7000.00',
        mobileReference: 'ManagerAmina',
      },
    });

    // Waiter submits the same payer name as the manager's row -> 409, nothing new committed.
    const collectionsBefore = await prisma.collection.count({
      where: { shiftId: shift.id, voidedAt: null },
    });

    await expect(
      submitWaiterCollections({
        summaryId: summary.id,
        actorId: waiterId,
        actorRole: 'WAITER',
        mpesaEntries: [{ payerName: 'ManagerAmina', amount: '7000.00' }],
        expenses: [{ categoryId: dailyCategoryId, description: 'ShouldNotPersist', amount: '50.00' }],
      })
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT_WITH_OTHER_ACTOR' });

    const collectionsAfter = await prisma.collection.count({
      where: { shiftId: shift.id, voidedAt: null },
    });
    // Nothing new added, nothing from the manager voided.
    expect(collectionsAfter).toBe(collectionsBefore);

    const managerRow = await prisma.collection.findFirstOrThrow({
      where: { shiftId: shift.id, createdById: managerId },
    });
    expect(managerRow.voidedAt).toBeNull();
    expect(managerRow.amount.toString()).toBe('7000');

    // The waiter's expense from the failed call must not exist either (full rollback).
    const phantomExpense = await prisma.expense.findFirst({
      where: { createdBy: waiterId, description: 'ShouldNotPersist' },
    });
    expect(phantomExpense).toBeNull();
  });

  it('duplicate payer name within one submission rolls back entirely', async () => {
    const summary = await seedSummary(waiterId, '50000.00');

    const before = await prisma.collection.count({ where: { userId: waiterId } });

    await expect(
      submitWaiterCollections({
        summaryId: summary.id,
        actorId: waiterId,
        actorRole: 'WAITER',
        mpesaEntries: [
          { payerName: 'Amina', amount: '5000.00' },
          { payerName: 'Amina', amount: '3000.00' },
        ],
        expenses: [],
      })
    ).rejects.toMatchObject({ status: 409, code: 'DUPLICATE_MOBILE_REFERENCE' });

    const after = await prisma.collection.count({ where: { userId: waiterId } });
    expect(after).toBe(before);
  });

  it('blocks submission to a closed business day', async () => {
    const summary = await seedSummary(waiterId, '50000.00');

    // Mark the day as closed by inserting a DailyClosing row directly.
    const closing = await prisma.dailyClosing.create({
      data: {
        businessDate: new Date(todayISO()),
        version: 1,
        status: 'CLOSED',
        salesSummaryTotal: '0',
        salesSummaryCash: '0',
        salesSummaryMobile: '0',
        salesSummaryOther: '0',
        expectedCash: '0',
        expectedMobile: '0',
        actualCash: '0',
        actualMobile: '0',
        cashDifference: '0',
        mobileDifference: '0',
        cashSalesDiscrepancy: '0',
        mobileSalesDiscrepancy: '0',
        otherSalesDiscrepancy: '0',
        totalHandovers: 0,
        totalHandoverAmount: '0',
        pendingHandoverCount: 0,
        pendingHandoverAmount: '0',
        confirmedHandoverCount: 0,
        confirmedHandoverAmount: '0',
        shiftCount: 0,
        reconciliationCount: 0,
        pendingReviewCount: 0,
        totalExpenses: '0',
        totalCashExpenses: '0',
        snapshotJson: {},
        closedBy: managerId,
      },
    });

    try {
      await expect(
        submitWaiterCollections({
          summaryId: summary.id,
          actorId: waiterId,
          actorRole: 'WAITER',
          mpesaEntries: [{ payerName: 'Amina', amount: '5000.00' }],
          expenses: [],
        })
      ).rejects.toMatchObject({ status: 409, code: 'DAY_IS_CLOSED' });
    } finally {
      await prisma.dailyClosing.delete({ where: { id: closing.id } });
    }
  });

  it('waiter cannot submit on another waiter summary (403)', async () => {
    const others = await seedSummary(otherWaiterId, '10000.00');

    await expect(
      submitWaiterCollections({
        summaryId: others.id,
        actorId: waiterId,
        actorRole: 'WAITER',
        mpesaEntries: [],
        expenses: [],
      })
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('rejects a summary with no assigned waiter', async () => {
    const orphan = await prisma.salesSummary.create({
      data: {
        businessDate: new Date(todayISO()),
        source: 'MANUAL',
        sourceReference: '',
        userId: null,
        enteredBy: waiterId,
        totalSales: '1000.00',
        cashSales: '1000.00',
        mobileSales: '0.00',
        otherSales: '0.00',
      },
    });

    try {
      await expect(
        submitWaiterCollections({
          summaryId: orphan.id,
          actorId: waiterId,
          actorRole: 'WAITER',
          mpesaEntries: [],
          expenses: [],
        })
      ).rejects.toMatchObject({ status: 409, code: 'NO_ASSIGNED_WAITER' });
    } finally {
      await prisma.salesSummary.delete({ where: { id: orphan.id } });
    }
  });

  it('manager submitting on a waiter summary is permitted (same endpoint, different actor)', async () => {
    const summary = await seedSummary(waiterId, '50000.00');

    const result = await submitWaiterCollections({
      summaryId: summary.id,
      actorId: managerId,
      actorRole: 'MANAGER',
      mpesaEntries: [{ payerName: 'Amina', amount: '4000.00' }],
      expenses: [],
    });

    expect(result.collections).toHaveLength(1);

    const row = await prisma.collection.findUniqueOrThrow({
      where: { id: result.collections[0].id },
    });
    expect(row.userId).toBe(waiterId);          // attributed to the waiter
    expect(row.createdById).toBe(managerId);    // recorded by the manager
  });

  it('empty mpesaEntries with non-empty expenses still works (supersedes prior collections)', async () => {
    const summary = await seedSummary(waiterId, '50000.00');

    await submitWaiterCollections({
      summaryId: summary.id,
      actorId: waiterId,
      actorRole: 'WAITER',
      mpesaEntries: [{ payerName: 'Amina', amount: '5000.00' }],
      expenses: [],
    });

    await submitWaiterCollections({
      summaryId: summary.id,
      actorId: waiterId,
      actorRole: 'WAITER',
      mpesaEntries: [],
      expenses: [{ categoryId: dailyCategoryId, description: 'OnlyExpense', amount: '300.00' }],
    });

    const activeCollections = await prisma.collection.findMany({
      where: { userId: waiterId, voidedAt: null },
    });
    expect(activeCollections).toHaveLength(0);

    const voidedCollections = await prisma.collection.findMany({
      where: { userId: waiterId, voidedAt: { not: null } },
    });
    expect(voidedCollections).toHaveLength(1);

    const activeExpenses = await prisma.expense.findMany({
      where: { createdBy: waiterId, voidedAt: null },
    });
    expect(activeExpenses).toHaveLength(1);
    expect(activeExpenses[0].description).toBe('OnlyExpense');
  });
});

describe('listEmployeesForKiosk', () => {
  it("returns only the calling user's active Employee record", async () => {
    const position = await prisma.position.findFirstOrThrow({ where: { isActive: true } });
    const emp = await prisma.employee.create({
      data: {
        employeeNumber: 'TEST-KIOSK-1',
        fullName: 'Kiosk Waiter',
        positionId: position.id,
        userId: waiterId,
        startDate: new Date(),
        isActive: true,
      },
    });
    const other = await prisma.employee.create({
      data: {
        employeeNumber: 'TEST-KIOSK-2',
        fullName: 'Other Employee',
        positionId: position.id,
        userId: otherWaiterId,
        startDate: new Date(),
        isActive: true,
      },
    });

    try {
      const { listEmployeesForKiosk } = await import('../src/services/employeeService.js');
      const rows = await listEmployeesForKiosk(waiterId);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(emp.id);
      expect(rows[0].fullName).toBe('Kiosk Waiter');
      expect(rows.find((r) => r.id === other.id)).toBeUndefined();
    } finally {
      await prisma.employee.deleteMany({ where: { id: { in: [emp.id, other.id] } } });
    }
  });

  it('returns [] when the calling user has no Employee record', async () => {
    const { listEmployeesForKiosk } = await import('../src/services/employeeService.js');
    const rows = await listEmployeesForKiosk(waiterId);
    expect(rows).toEqual([]);
  });
});
