import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import argon2 from 'argon2';
import { prisma } from '../src/lib/prisma.js';
import { createManualSummary, listMySummary, submitWaiterReport } from '../src/services/salesService.js';

const WAITER = {
  username: 'waiter-report-waiter',
  password: 'WaiterReport!234',
  fullName: 'Waiter Report Waiter',
};
const OTHER = {
  username: 'waiter-report-other',
  password: 'WaiterReport!234',
  fullName: 'Waiter Report Other',
};

function todayISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}

async function cleanup() {
  const names = [WAITER.username, OTHER.username];
  const users = await prisma.user.findMany({ where: { username: { in: names } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  if (!uids.length) return;
  await prisma.expense.deleteMany({ where: { createdBy: { in: uids } } });
  const summaries = await prisma.salesSummary.findMany({ where: { userId: { in: uids } }, select: { id: true } });
  const sids = summaries.map((s) => s.id);
  if (sids.length) {
    await prisma.salesSummaryLine.deleteMany({ where: { salesSummaryId: { in: sids } } });
    await prisma.salesSummary.deleteMany({ where: { id: { in: sids } } });
  }
  await prisma.shift.deleteMany({ where: { userId: { in: uids } } });
  await prisma.session.deleteMany({ where: { userId: { in: uids } } });
  await prisma.user.deleteMany({ where: { id: { in: uids } } });
}

let waiterId: string;
let otherId: string;

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
  const o = await prisma.user.create({
    data: {
      username: OTHER.username,
      fullName: OTHER.fullName,
      role: 'WAITER',
      passwordHash: await argon2.hash(OTHER.password, { type: argon2.argon2id }),
      isActive: true,
    },
  });
  otherId = o.id;
});

afterAll(async () => {
  try { await cleanup(); } catch (e) { console.error('[waiterReport teardown]', e); }
});

beforeEach(async () => {
  await prisma.expense.deleteMany({ where: { createdBy: { in: [waiterId, otherId] } } });
  const summaries = await prisma.salesSummary.findMany({
    where: { userId: { in: [waiterId, otherId] } },
    select: { id: true },
  });
  const sids = summaries.map((s) => s.id);
  if (sids.length) {
    await prisma.salesSummaryLine.deleteMany({ where: { salesSummaryId: { in: sids } } });
    await prisma.salesSummary.deleteMany({ where: { id: { in: sids } } });
  }
});

describe('Daily report — waiter fetch + submit', () => {
  it('listMySummary returns null when no summary exists for the waiter', async () => {
    const result = await listMySummary(waiterId, todayISO());
    expect(result).toBeNull();
  });

  it('listMySummary returns the summary plus active DAILY expenses', async () => {
    await createManualSummary({
      businessDate: todayISO(),
      sourceReference: '',
      userId: waiterId,
      notes: null,
      lines: [],
      totalSales: '50000.00',
      expenseRows: [{ description: 'Seed', amount: '100.00' }],
      enteredBy: waiterId,
      actorRole: 'WAITER',
    });
    const result = await listMySummary(waiterId, todayISO());
    expect(result).not.toBeNull();
    expect(result!.summary.totalSales).toBe('50000.00');
    expect(result!.activeExpenses).toHaveLength(1);
    expect(result!.activeExpenses[0].description).toBe('Seed');
  });

  it('waiter submission replaces MPESA lines and does not touch totalSales', async () => {
    const created = await createManualSummary({
      businessDate: todayISO(),
      sourceReference: '',
      userId: waiterId,
      notes: null,
      lines: [{ paymentMethod: 'MPESA', amount: '8000.00', notes: 'aggregate' }],
      totalSales: '50000.00',
      enteredBy: waiterId,
      actorRole: 'WAITER',
    });

    const updated = await submitWaiterReport({
      summaryId: created.id,
      actorId: waiterId,
      actorRole: 'WAITER',
      mpesaRows: [
        { name: 'Amina', amount: '5000.00' },
        { name: 'Juma', amount: '3000.00' },
      ],
      expenseRows: [{ description: 'Fuel', amount: '2000.00' }],
    });

    expect(updated.totalSales).toBe('50000.00');       // unchanged
    expect(updated.mobileSales).toBe('8000.00');
    expect(updated.cashSales).toBe('42000.00');

    const lines = await prisma.salesSummaryLine.findMany({ where: { salesSummaryId: created.id } });
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.notes).sort()).toEqual(['Amina', 'Juma']);

    const expenses = await prisma.expense.findMany({ where: { createdBy: waiterId, voidedAt: null } });
    expect(expenses).toHaveLength(1);
    expect(expenses[0].description).toBe('Fuel');
  });

  it('resubmission supersedes prior DAILY expenses for this waiter', async () => {
    const d = todayISO();
    const created = await createManualSummary({
      businessDate: d,
      sourceReference: '',
      userId: waiterId,
      notes: null,
      lines: [],
      totalSales: '50000.00',
      enteredBy: waiterId,
      actorRole: 'WAITER',
    });

    await submitWaiterReport({
      summaryId: created.id,
      actorId: waiterId,
      actorRole: 'WAITER',
      mpesaRows: [],
      expenseRows: [{ description: 'First', amount: '100.00' }],
    });
    await submitWaiterReport({
      summaryId: created.id,
      actorId: waiterId,
      actorRole: 'WAITER',
      mpesaRows: [],
      expenseRows: [{ description: 'Second', amount: '200.00' }],
    });

    const active = await prisma.expense.findMany({ where: { createdBy: waiterId, voidedAt: null } });
    expect(active).toHaveLength(1);
    expect(active[0].description).toBe('Second');

    const voided = await prisma.expense.findMany({ where: { createdBy: waiterId, voidedAt: { not: null } } });
    expect(voided).toHaveLength(1);
    expect(voided[0].description).toBe('First');
  });

  it('does not void another waiter\'s DAILY expenses', async () => {
    const d = todayISO();
    await createManualSummary({
      businessDate: d,
      sourceReference: '',
      userId: otherId,
      notes: null,
      lines: [],
      totalSales: '10000.00',
      expenseRows: [{ description: 'Other', amount: '50.00' }],
      enteredBy: otherId,
      actorRole: 'WAITER',
    });
    const mine = await createManualSummary({
      businessDate: d,
      sourceReference: '',
      userId: waiterId,
      notes: null,
      lines: [],
      totalSales: '50000.00',
      enteredBy: waiterId,
      actorRole: 'WAITER',
    });

    await submitWaiterReport({
      summaryId: mine.id,
      actorId: waiterId,
      actorRole: 'WAITER',
      mpesaRows: [],
      expenseRows: [{ description: 'Mine', amount: '75.00' }],
    });

    const otherActive = await prisma.expense.findMany({ where: { createdBy: otherId, voidedAt: null } });
    expect(otherActive).toHaveLength(1);
    expect(otherActive[0].description).toBe('Other');
  });

  it('waiter cannot submit on behalf of another waiter', async () => {
    const others = await createManualSummary({
      businessDate: todayISO(),
      sourceReference: '',
      userId: otherId,
      notes: null,
      lines: [],
      totalSales: '10000.00',
      enteredBy: otherId,
      actorRole: 'WAITER',
    });

    await expect(
      submitWaiterReport({
        summaryId: others.id,
        actorId: waiterId,
        actorRole: 'WAITER',
        mpesaRows: [],
        expenseRows: [],
      })
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('rejects a summary with no assigned waiter', async () => {
    // create a summary without userId
    const created = await prisma.salesSummary.create({
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
    await expect(
      submitWaiterReport({
        summaryId: created.id,
        actorId: waiterId,
        actorRole: 'WAITER',
        mpesaRows: [],
        expenseRows: [],
      })
    ).rejects.toMatchObject({ status: 409, code: 'NO_ASSIGNED_WAITER' });

    await prisma.salesSummary.delete({ where: { id: created.id } });
  });
});