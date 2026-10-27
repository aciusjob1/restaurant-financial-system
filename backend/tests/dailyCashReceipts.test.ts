import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import argon2 from 'argon2';
import { prisma } from '../src/lib/prisma.js';
import {
  createManualSummary,
  submitWaiterCollections,
} from '../src/services/salesService.js';
import { upsertReceipt, listForDate, getMyReceiptForDate } from '../src/services/dailyCashReceiptService.js';

const WAITER = {
  username: 'dcr-waiter',
  password: 'DailyCash!2345',
  fullName: 'Daily Cash Waiter',
};
const MANAGER = {
  username: 'dcr-manager',
  password: 'DailyCash!2345',
  fullName: 'Daily Cash Manager',
};

// Fixed far-future date. Isolates this suite from other files that build
// DailyClosing rows for today's real business date. No other suite uses
// 2099-06-15, so no other suite can close it out from under this one.
const TEST_DATE = '2099-06-15';
function todayISO(): string {
  return TEST_DATE;
}

let waiterId: string;
let managerId: string;
let dailyCategoryId: string;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { username: { in: [WAITER.username, MANAGER.username] } },
    select: { id: true },
  });
  const uids = users.map((u) => u.id);
  if (!uids.length) return;

  await prisma.dailyCashReceipt.deleteMany({ where: { userId: { in: uids } } });
  await prisma.expense.deleteMany({ where: { createdBy: { in: uids } } });
  await prisma.collection.deleteMany({ where: { userId: { in: uids } } });
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

async function makeUser(u: { username: string; password: string; fullName: string; role: 'WAITER' | 'MANAGER' }) {
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

beforeAll(async () => {
  await cleanup();
  const w = await makeUser({ ...WAITER, role: 'WAITER' });
  waiterId = w.id;
  const m = await makeUser({ ...MANAGER, role: 'MANAGER' });
  managerId = m.id;

  const dailyCat = await prisma.expenseCategory.findUnique({
    where: { systemKey: 'DAILY' },
    select: { id: true },
  });
  if (!dailyCat) throw new Error('DAILY expense category missing — run prisma:apply-raw-sql');
  dailyCategoryId = dailyCat.id;
});

afterAll(cleanup);

beforeEach(async () => {
  const uids = [waiterId, managerId];
  // Neutralize any DailyClosing row for today that another test file may
  // have left behind. createManualSummary calls assertDayNotClosed, and
  // the parallel test runner can interleave suites such that a closing
  // exists transiently. This suite tests receipts, not the closed-day
  // guard, so removing the row is the right isolation.
  await prisma.dailyClosing.deleteMany({ where: { businessDate: new Date(todayISO()) } });
  await prisma.dailyCashReceipt.deleteMany({ where: { userId: { in: uids } } });
  await prisma.expense.deleteMany({ where: { createdBy: { in: uids } } });
  await prisma.collection.deleteMany({ where: { userId: { in: uids } } });
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

async function seedSummary(totalSales = '50000.00', mobileSales = '0.00') {
  // createManualSummary does not accept a mobileSales override — the
  // field is derived from lines. Update the row directly so the tests
  // can seed a specific mobile/cash split.
  await createManualSummary({
    businessDate: todayISO(),
    sourceReference: '',
    userId: waiterId,
    notes: null,
    lines: [],
    totalSales,
    enteredBy: waiterId,
    actorRole: 'WAITER',
  });
  const s = await prisma.salesSummary.findFirstOrThrow({
    where: { userId: waiterId, businessDate: new Date(todayISO()) },
    orderBy: { createdAt: 'desc' },
  });
  if (mobileSales !== '0.00') {
    return prisma.salesSummary.update({
      where: { id: s.id },
      data: { mobileSales },
    });
  }
  return s;
}

async function currentReceipt() {
  return prisma.dailyCashReceipt.findUnique({
    where: { userId_businessDate: { userId: waiterId, businessDate: new Date(todayISO()) } },
  });
}

describe('DailyCashReceipt — creation and resubmission', () => {
  it('first submission creates a PENDING receipt', async () => {
    const summary = await seedSummary();
    await submitWaiterCollections({
      summaryId: summary.id, actorId: waiterId, actorRole: 'WAITER',
      mpesaEntries: [{ payerName: 'Amina', amount: '5000.00' }],
      expenses: [{ categoryId: dailyCategoryId, description: 'Fuel', amount: '2000.00' }],
    });
    const r = await currentReceipt();
    expect(r).toBeTruthy();
    expect(r!.status).toBe('PENDING');
    expect(r!.createdBy).toBe(waiterId);
    expect(r!.submissionFingerprint).toBeTruthy();
    expect(r!.decidedBy).toBeNull();
  });

  it('identical resubmission preserves decision', async () => {
    const summary = await seedSummary();
    await submitWaiterCollections({
      summaryId: summary.id, actorId: waiterId, actorRole: 'WAITER',
      mpesaEntries: [{ payerName: 'Amina', amount: '5000.00' }], expenses: [],
    });
    const before = await currentReceipt();
    await upsertReceipt({
      userId: waiterId, businessDate: todayISO(), status: 'APPROVED',
      amountReceived: null, actorId: managerId,
      expectedUpdatedAt: before!.updatedAt.toISOString(),
    });
    await submitWaiterCollections({
      summaryId: summary.id, actorId: waiterId, actorRole: 'WAITER',
      mpesaEntries: [{ payerName: 'Amina', amount: '5000.00' }], expenses: [],
    });
    const after = await currentReceipt();
    expect(after!.status).toBe('APPROVED');
    const active = await prisma.dailyCashReceiptDecision.findMany({
      where: { receiptId: after!.id, invalidatedAt: null },
    });
    expect(active).toHaveLength(1);
  });

  it('changed resubmission invalidates decision and resets to PENDING', async () => {
    const summary = await seedSummary();
    await submitWaiterCollections({
      summaryId: summary.id, actorId: waiterId, actorRole: 'WAITER',
      mpesaEntries: [{ payerName: 'Amina', amount: '5000.00' }], expenses: [],
    });
    const before = await currentReceipt();
    await upsertReceipt({
      userId: waiterId, businessDate: todayISO(), status: 'APPROVED',
      amountReceived: null, actorId: managerId,
      expectedUpdatedAt: before!.updatedAt.toISOString(),
    });
    await submitWaiterCollections({
      summaryId: summary.id, actorId: waiterId, actorRole: 'WAITER',
      mpesaEntries: [{ payerName: 'Amina', amount: '6000.00' }], expenses: [],
    });
    const after = await currentReceipt();
    expect(after!.status).toBe('PENDING');
    expect(after!.decidedBy).toBeNull();
    const active = await prisma.dailyCashReceiptDecision.findMany({
      where: { receiptId: after!.id, invalidatedAt: null },
    });
    expect(active).toHaveLength(0);
    const invalidated = await prisma.dailyCashReceiptDecision.findMany({
      where: { receiptId: after!.id, invalidatedAt: { not: null } },
    });
    expect(invalidated).toHaveLength(1);
  });
});

describe('DailyCashReceipt — decisions', () => {
  it('APPROVED computes expected net', async () => {
    const summary = await seedSummary('50000.00', '10000.00');
    await submitWaiterCollections({
      summaryId: summary.id, actorId: waiterId, actorRole: 'WAITER',
      mpesaEntries: [{ payerName: 'Amina', amount: '10000.00' }],
      expenses: [{ categoryId: dailyCategoryId, description: 'Fuel', amount: '2000.00' }],
    });
    const before = await currentReceipt();
    const res = await upsertReceipt({
      userId: waiterId, businessDate: todayISO(), status: 'APPROVED',
      amountReceived: null, actorId: managerId,
      expectedUpdatedAt: before!.updatedAt.toISOString(),
    });
    expect(res.status).toBe('APPROVED');
    expect(res.amountReceived).toBe('38000.00');
  });

  it('APPROVED with wrong amount returns AMOUNT_MISMATCH', async () => {
    const summary = await seedSummary();
    await submitWaiterCollections({
      summaryId: summary.id, actorId: waiterId, actorRole: 'WAITER',
      mpesaEntries: [], expenses: [],
    });
    const before = await currentReceipt();
    await expect(upsertReceipt({
      userId: waiterId, businessDate: todayISO(), status: 'APPROVED',
      amountReceived: '49999.00', actorId: managerId,
      expectedUpdatedAt: before!.updatedAt.toISOString(),
    })).rejects.toMatchObject({ status: 409, code: 'AMOUNT_MISMATCH' });
  });

  it('INSUFFICIENT without amount returns AMOUNT_REQUIRED', async () => {
    const summary = await seedSummary();
    await submitWaiterCollections({
      summaryId: summary.id, actorId: waiterId, actorRole: 'WAITER',
      mpesaEntries: [], expenses: [],
    });
    const before = await currentReceipt();
    await expect(upsertReceipt({
      userId: waiterId, businessDate: todayISO(), status: 'INSUFFICIENT',
      amountReceived: null, actorId: managerId,
      expectedUpdatedAt: before!.updatedAt.toISOString(),
    })).rejects.toMatchObject({ status: 400, code: 'AMOUNT_REQUIRED' });
  });

  it('INSUFFICIENT with amount >= expected returns NOT_INSUFFICIENT', async () => {
    const summary = await seedSummary();
    await submitWaiterCollections({
      summaryId: summary.id, actorId: waiterId, actorRole: 'WAITER',
      mpesaEntries: [], expenses: [],
    });
    const before = await currentReceipt();
    await expect(upsertReceipt({
      userId: waiterId, businessDate: todayISO(), status: 'INSUFFICIENT',
      amountReceived: '50000.00', actorId: managerId,
      expectedUpdatedAt: before!.updatedAt.toISOString(),
    })).rejects.toMatchObject({ status: 400, code: 'NOT_INSUFFICIENT' });
  });

  it('NO_NETCASH_HANDED_OVER with amount returns AMOUNT_NOT_ALLOWED', async () => {
    const summary = await seedSummary();
    await submitWaiterCollections({
      summaryId: summary.id, actorId: waiterId, actorRole: 'WAITER',
      mpesaEntries: [], expenses: [],
    });
    const before = await currentReceipt();
    await expect(upsertReceipt({
      userId: waiterId, businessDate: todayISO(), status: 'NO_NETCASH_HANDED_OVER',
      amountReceived: '100.00', actorId: managerId,
      expectedUpdatedAt: before!.updatedAt.toISOString(),
    })).rejects.toMatchObject({ status: 400, code: 'AMOUNT_NOT_ALLOWED' });
  });

  it('returns NO_SUBMISSION when no receipt exists', async () => {
    await seedSummary();
    await expect(upsertReceipt({
      userId: waiterId, businessDate: todayISO(), status: 'APPROVED',
      amountReceived: null, actorId: managerId,
      expectedUpdatedAt: new Date().toISOString(),
    })).rejects.toMatchObject({ status: 409, code: 'NO_SUBMISSION' });
  });

  it('returns STALE_RECEIPT on mismatched updatedAt', async () => {
    const summary = await seedSummary();
    await submitWaiterCollections({
      summaryId: summary.id, actorId: waiterId, actorRole: 'WAITER',
      mpesaEntries: [], expenses: [],
    });
    const stale = new Date(Date.now() - 60_000).toISOString();
    await expect(upsertReceipt({
      userId: waiterId, businessDate: todayISO(), status: 'APPROVED',
      amountReceived: null, actorId: managerId,
      expectedUpdatedAt: stale,
    })).rejects.toMatchObject({ status: 409, code: 'STALE_RECEIPT' });
  });
});

describe('DailyCashReceipt — zero and negative net', () => {
  it('APPROVED at zero is valid', async () => {
    const summary = await seedSummary('5000.00', '5000.00');
    await submitWaiterCollections({
      summaryId: summary.id, actorId: waiterId, actorRole: 'WAITER',
      mpesaEntries: [{ payerName: 'Amina', amount: '5000.00' }], expenses: [],
    });
    const before = await currentReceipt();
    const res = await upsertReceipt({
      userId: waiterId, businessDate: todayISO(), status: 'APPROVED',
      amountReceived: null, actorId: managerId,
      expectedUpdatedAt: before!.updatedAt.toISOString(),
    });
    expect(res.amountReceived).toBe('0.00');
  });

  it('INSUFFICIENT on zero net is rejected', async () => {
    const summary = await seedSummary('5000.00', '5000.00');
    await submitWaiterCollections({
      summaryId: summary.id, actorId: waiterId, actorRole: 'WAITER',
      mpesaEntries: [{ payerName: 'Amina', amount: '5000.00' }], expenses: [],
    });
    const before = await currentReceipt();
    await expect(upsertReceipt({
      userId: waiterId, businessDate: todayISO(), status: 'INSUFFICIENT',
      amountReceived: '0.00', actorId: managerId,
      expectedUpdatedAt: before!.updatedAt.toISOString(),
    })).rejects.toMatchObject({ status: 400, code: 'STATUS_NOT_ALLOWED_FOR_NET' });
  });

  it('APPROVED on negative net is rejected', async () => {
    const summary = await seedSummary('1000.00', '5000.00');
    await submitWaiterCollections({
      summaryId: summary.id, actorId: waiterId, actorRole: 'WAITER',
      mpesaEntries: [{ payerName: 'Amina', amount: '5000.00' }], expenses: [],
    });
    const before = await currentReceipt();
    await expect(upsertReceipt({
      userId: waiterId, businessDate: todayISO(), status: 'APPROVED',
      amountReceived: null, actorId: managerId,
      expectedUpdatedAt: before!.updatedAt.toISOString(),
    })).rejects.toMatchObject({ status: 400, code: 'STATUS_NOT_ALLOWED_FOR_NET' });
  });

  it('NO_NETCASH on negative net is allowed', async () => {
    const summary = await seedSummary('1000.00', '5000.00');
    await submitWaiterCollections({
      summaryId: summary.id, actorId: waiterId, actorRole: 'WAITER',
      mpesaEntries: [{ payerName: 'Amina', amount: '5000.00' }], expenses: [],
    });
    const before = await currentReceipt();
    const res = await upsertReceipt({
      userId: waiterId, businessDate: todayISO(), status: 'NO_NETCASH_HANDED_OVER',
      amountReceived: null, actorId: managerId,
      expectedUpdatedAt: before!.updatedAt.toISOString(),
    });
    expect(res.status).toBe('NO_NETCASH_HANDED_OVER');
  });
});

describe('DailyCashReceipt — listForDate', () => {
  it('groups multiple summaries for one waiter into one row', async () => {
    await seedSummary('30000.00');
    await createManualSummary({
      businessDate: todayISO(), sourceReference: 'second',
      userId: waiterId, notes: null, lines: [],
      totalSales: '20000.00', enteredBy: waiterId, actorRole: 'WAITER',
    });
    const rows = await listForDate(todayISO());
    const mine = rows.filter((r) => r.userId === waiterId);
    expect(mine).toHaveLength(1);
    expect(mine[0].sales).toBe('50000.00');
  });

  it('returns receipt:null when a summary exists without a receipt', async () => {
    await seedSummary();
    const rows = await listForDate(todayISO());
    const mine = rows.find((r) => r.userId === waiterId);
    expect(mine).toBeTruthy();
    expect(mine!.receipt).toBeNull();
  });

  it('regression: receipt flow creates exactly one shift via the collection path', async () => {
    const summary = await seedSummary();
    // createManualSummary calls ensureActiveShift, so a shift already
    // exists. Baseline it — the point of this test is that neither
    // submitWaiterCollections nor upsertReceipt creates an ADDITIONAL
    // shift or any reconciliation/handover row.
    const shiftsAfterSeed = await prisma.shift.count({
      where: { userId: waiterId, businessDate: new Date(todayISO()) },
    });
    expect(shiftsAfterSeed).toBe(1);

    await submitWaiterCollections({
      summaryId: summary.id, actorId: waiterId, actorRole: 'WAITER',
      mpesaEntries: [], expenses: [],
    });

    const shiftsAfterSubmit = await prisma.shift.count({
      where: { userId: waiterId, businessDate: new Date(todayISO()) },
    });
    expect(shiftsAfterSubmit).toBe(1);

    const before = await currentReceipt();
    await upsertReceipt({
      userId: waiterId, businessDate: todayISO(), status: 'APPROVED',
      amountReceived: null, actorId: managerId,
      expectedUpdatedAt: before!.updatedAt.toISOString(),
    });

    const shiftsAfterDecision = await prisma.shift.count({
      where: { userId: waiterId, businessDate: new Date(todayISO()) },
    });
    expect(shiftsAfterDecision).toBe(1);

    const recons = await prisma.reconciliation.count();
    const handovers = await prisma.cashHandover.count();
    expect(recons).toBe(0);
    expect(handovers).toBe(0);
  });
});

describe('DailyCashReceipt вЂ” getMyReceiptForDate', () => {
    it("returns only the caller's own receipt for the date, or null", async () => {
    const summary = await seedSummary();
    await submitWaiterCollections({
      summaryId: summary.id, actorId: waiterId, actorRole: 'WAITER',
      mpesaEntries: [{ payerName: 'Amina', amount: '1000.00' }], expenses: [],
    });
    const mine = await getMyReceiptForDate(waiterId, todayISO());
    expect(mine).not.toBeNull();
    expect(mine!.status).toBe('PENDING');
    expect(mine!.decidedAt).toBeNull();
    expect(mine!.amountReceived).toBeNull();

    // A different user (the manager) has no receipt for the same date.
    const manager = await getMyReceiptForDate(managerId, todayISO());
    expect(manager).toBeNull();
  });
});
