import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

const OWNER = { username: 'phase16-owner', password: 'OwnerPassword!234', fullName: 'Phase16 Owner', role: 'OWNER' as const };
const MANAGER = { username: 'phase16-manager', password: 'ManagerPassword!234', fullName: 'Phase16 Manager', role: 'MANAGER' as const };
const WAITER = { username: 'phase16-waiter', password: 'WaiterPassword!234', fullName: 'Phase16 Waiter', role: 'WAITER' as const };
const AUDITOR = { username: 'phase16-auditor', password: 'AuditorPassword!234', fullName: 'Phase16 Auditor', role: 'AUDITOR' as const };
const ALL = [OWNER, MANAGER, WAITER, AUDITOR];

const D1 = '2025-03-15';
const D2 = '2025-03-16';
const D_OUTSIDE = '2025-04-20';
const D_FROM = '2025-03-01';
const D_TO = '2025-03-31';

const TEST_CAT = 'Phase16 Test Category';
const TEST_MAT_NAME = 'Phase16 Test Material';
const TEST_MAT_NUMBER = 'MAT-P16-001';
const TEST_SUPPLIER_NAME = 'Phase16 Test Supplier';
const TEST_SUPPLIER_NUMBER = 'SUP-P16-001';
const TEST_EXP_CAT = 'Phase16 Test Expense Category';
const EXPENSE_NUMBER = 'EXP-P16-001';

const ALL_ENDPOINTS = [
  '/api/v1/reports/daily-sales?from=' + D_FROM + '&to=' + D_TO,
  '/api/v1/reports/reconciliations?from=' + D_FROM + '&to=' + D_TO,
  '/api/v1/reports/handovers?from=' + D_FROM + '&to=' + D_TO,
  '/api/v1/reports/expenses?from=' + D_FROM + '&to=' + D_TO,
  '/api/v1/reports/supplier-balances',
  '/api/v1/reports/sales-vs-pos?from=' + D_FROM + '&to=' + D_TO,
  '/api/v1/reports/stock-movements?from=' + D_FROM + '&to=' + D_TO,
];

async function cleanup() {
  const usernames = ALL.map((u) => u.username);

  await prisma.cashHandover.deleteMany({
    where: {
      OR: [
        { fromUser: { username: { in: usernames } } },
        { toUser: { username: { in: usernames } } },
        { reconciliation: { user: { username: { in: usernames } } } },
      ],
    },
  });
  await prisma.reconciliation.deleteMany({
    where: { user: { username: { in: usernames } } },
  });
  await prisma.collection.deleteMany({
    where: { user: { username: { in: usernames } } },
  });
  await prisma.shift.deleteMany({
    where: { user: { username: { in: usernames } } },
  });
  await prisma.stockMovement.deleteMany({
    where: {
      OR: [
        { createdByUser: { username: { in: usernames } } },
        { material: { category: { name: TEST_CAT } } },
      ],
    },
  });
  await prisma.paymentAllocation.deleteMany({
    where: { purchaseInvoice: { supplier: { name: TEST_SUPPLIER_NAME } } },
  });
  await prisma.supplierPayment.deleteMany({
    where: { supplier: { name: TEST_SUPPLIER_NAME } },
  });
  await prisma.purchaseItem.deleteMany({
    where: { purchaseInvoice: { supplier: { name: TEST_SUPPLIER_NAME } } },
  });
  await prisma.purchaseInvoice.deleteMany({
    where: { supplier: { name: TEST_SUPPLIER_NAME } },
  });
  await prisma.supplier.deleteMany({
    where: { name: TEST_SUPPLIER_NAME },
  });
  await prisma.material.deleteMany({
    where: { OR: [{ category: { name: TEST_CAT } }, { name: TEST_MAT_NAME }] },
  });
  await prisma.materialCategory.deleteMany({
    where: { name: TEST_CAT },
  });
  await prisma.expense.deleteMany({
    where: { createdByUser: { username: { in: usernames } } },
  });
  await prisma.expenseCategory.deleteMany({
    where: { name: TEST_EXP_CAT },
  });
  // SalesSummary is uniquely keyed by (source, businessDate, sourceReference).
  // `enteredBy` holds a User id and � because the FK is SetNull � may have
  // been nulled by an earlier cleanup. Identify our rows by sourceReference
  // (unique to this test file) so cleanup is idempotent across runs.
  const mySummaries = await prisma.salesSummary.findMany({
    where: { sourceReference: { startsWith: 'phase16-' } },
    select: { id: true },
  });
  if (mySummaries.length > 0) {
    const ids = mySummaries.map((s) => s.id);
    await prisma.salesSummaryLine.deleteMany({
      where: { salesSummaryId: { in: ids } },
    });
    await prisma.salesSummary.deleteMany({
      where: { id: { in: ids } },
    });
  }
  const testDates = [D1, D2, D_OUTSIDE].map(
    (d) => new Date(d + 'T00:00:00.000Z')
  );
  await prisma.dailyClosing.deleteMany({
    where: { businessDate: { in: testDates } },
  });
  await prisma.session.deleteMany({
    where: { user: { username: { in: usernames } } },
  });
  await prisma.user.deleteMany({ where: { username: { in: usernames } } });
}

async function makeUser(u: {
  username: string;
  password: string;
  fullName: string;
  role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR';
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

async function loginAs(u: { username: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/v1/auth/login')
    .send({ username: u.username, password: u.password });
  expect(res.status).toBe(200);
  return agent;
}

let ownerId: string;
let managerId: string;
let waiterId: string;
let materialId: string;
let supplierId: string;

beforeAll(async () => {
  await cleanup();

  const owner = await makeUser(OWNER);
  const manager = await makeUser(MANAGER);
  const waiter = await makeUser(WAITER);
  await makeUser(AUDITOR);
  ownerId = owner.id;
  managerId = manager.id;
  waiterId = waiter.id;

  const cat = await prisma.materialCategory.create({
    data: { name: TEST_CAT, createdBy: managerId },
  });
  const mat = await prisma.material.create({
    data: {
      materialNumber: TEST_MAT_NUMBER,
      name: TEST_MAT_NAME,
      categoryId: cat.id,
      unit: 'kg',
      currentPrice: '2500.00',
      createdBy: managerId,
    },
  });
  materialId = mat.id;

  const sup = await prisma.supplier.create({
    data: {
      supplierNumber: TEST_SUPPLIER_NUMBER,
      name: TEST_SUPPLIER_NAME,
      createdBy: managerId,
    },
  });
  supplierId = sup.id;

  const expCat = await prisma.expenseCategory.create({
    data: { name: TEST_EXP_CAT },
  });

  // ---- Sales summaries (D1: 1000/700/300; D2: 500/500/0) ----
  await prisma.salesSummary.create({
    data: {
      businessDate: new Date(D1 + 'T00:00:00.000Z'),
      source: 'MANUAL',
      sourceReference: 'phase16-d1',
      status: 'VERIFIED',
      totalSales: '1000.00',
      cashSales: '700.00',
      mobileSales: '300.00',
      otherSales: '0.00',
      enteredBy: ownerId,
    },
  });
  await prisma.salesSummary.create({
    data: {
      businessDate: new Date(D2 + 'T00:00:00.000Z'),
      source: 'MANUAL',
      sourceReference: 'phase16-d2',
      status: 'VERIFIED',
      totalSales: '500.00',
      cashSales: '500.00',
      mobileSales: '0.00',
      otherSales: '0.00',
      enteredBy: ownerId,
    },
  });

  // ---- Shift on D1 (CLOSED), collections CASH 700 + MPESA 300 ----
  const shift = await prisma.shift.create({
    data: {
      userId: waiterId,
      businessDate: new Date(D1 + 'T00:00:00.000Z'),
      status: 'CLOSED',
      openingCash: '0.00',
      endedAt: new Date(),
    },
  });
  await prisma.collection.create({
    data: {
      shiftId: shift.id,
      userId: waiterId,
      createdById: waiterId,
      paymentMethod: 'CASH',
      amount: '700.00',
    },
  });
  await prisma.collection.create({
    data: {
      shiftId: shift.id,
      userId: waiterId,
      createdById: waiterId,
      paymentMethod: 'MPESA',
      amount: '300.00',
      mobileReference: 'MPESA-P16-001',
    },
  });

  // ---- Reconciliation (REVIEWED), expected 700/300, actual 695/300 ----
  const recon = await prisma.reconciliation.create({
    data: {
      shiftId: shift.id,
      userId: waiterId,
      expectedCash: '700.00',
      expectedMobile: '300.00',
      actualCash: '695.00',
      actualMobile: '300.00',
      cashDifference: '-5.00',
      mobileDifference: '0.00',
      status: 'REVIEWED',
      submittedAt: new Date(),
      reviewedBy: managerId,
      reviewedAt: new Date(),
    },
  });

  // ---- Cash handover for 695, CONFIRMED ----
  await prisma.cashHandover.create({
    data: {
      shiftId: shift.id,
      reconciliationId: recon.id,
      fromUserId: waiterId,
      createdById: waiterId,
      toUserId: managerId,
      amount: '695.00',
      status: 'CONFIRMED',
      handedOverAt: new Date(),
      confirmedAt: new Date(),
    },
  });

  // ---- Expense on D1, APPROVED, 100 CASH ----
  await prisma.expense.create({
    data: {
      expenseNumber: EXPENSE_NUMBER,
      businessDate: new Date(D1 + 'T00:00:00.000Z'),
      categoryId: expCat.id,
      createdBy: managerId,
      approvedBy: ownerId,
      approvedAt: new Date(),
      amount: '100.00',
      paymentMethod: 'CASH',
      description: 'Phase 16 test expense',
      status: 'APPROVED',
    },
  });

  // ---- Stock movements on D1: OPENING/IN 100.000, CONSUMPTION/OUT 30.000 ----
  await prisma.stockMovement.create({
    data: {
      materialId,
      type: 'OPENING',
      direction: 'IN',
      businessDate: new Date(D1 + 'T00:00:00.000Z'),
      quantity: '100.000',
      unitCost: '2500.00',
      totalCost: '250000.00',
      createdBy: managerId,
    },
  });
  await prisma.stockMovement.create({
    data: {
      materialId,
      type: 'CONSUMPTION',
      direction: 'OUT',
      businessDate: new Date(D1 + 'T00:00:00.000Z'),
      quantity: '30.000',
      unitCost: '2500.00',
      totalCost: '75000.00',
      createdBy: managerId,
    },
  });
  await prisma.material.update({
    where: { id: materialId },
    data: { currentStock: '70.000' },
  });

  // ---- Purchase invoice on D2, POSTED, total 500.00 ----
  await prisma.purchaseInvoice.create({
    data: {
      invoiceNumber: 'INV-P16-001',
      supplierId,
      date: new Date(D2 + 'T00:00:00.000Z'),
      businessDate: new Date(D2 + 'T00:00:00.000Z'),
      subtotal: '500.00',
      total: '500.00',
      status: 'POSTED',
      createdBy: managerId,
      postedBy: managerId,
      postedAt: new Date(),
    },
  });

  // ---- Purchase invoice on OUTSIDE date, POSTED, total 250.00 ----
  await prisma.purchaseInvoice.create({
    data: {
      invoiceNumber: 'INV-P16-002',
      supplierId,
      date: new Date(D_OUTSIDE + 'T00:00:00.000Z'),
      businessDate: new Date(D_OUTSIDE + 'T00:00:00.000Z'),
      subtotal: '250.00',
      total: '250.00',
      status: 'POSTED',
      createdBy: managerId,
      postedBy: managerId,
      postedAt: new Date(),
    },
  });

  // ---- Supplier payment for 200.00 (unallocated) on D1 ----
  await prisma.supplierPayment.create({
    data: {
      paymentNumber: 'PAY-P16-001',
      supplierId,
      businessDate: new Date(D1 + 'T00:00:00.000Z'),
      amount: '200.00',
      paymentMethod: 'CASH',
      recordedBy: managerId,
    },
  });
});

afterAll(cleanup);

// ============ Auth ============

describe('Reports — auth', () => {
  it('WAITER receives 403 on every report endpoint', async () => {
    const w = await loginAs(WAITER);
    for (const ep of ALL_ENDPOINTS) {
      const res = await w.get(ep);
      expect(res.status).toBe(403);
    }
  });

  it('AUDITOR receives 200 on every report endpoint', async () => {
    const a = await loginAs(AUDITOR);
    for (const ep of ALL_ENDPOINTS) {
      const res = await a.get(ep);
      expect(res.status).toBe(200);
    }
  });
});

// ============ Validation ============

describe('Reports — validation', () => {
  it('missing from → 400 on all range endpoints', async () => {
    const m = await loginAs(MANAGER);
    const eps = [
      '/api/v1/reports/daily-sales?to=' + D_TO,
      '/api/v1/reports/reconciliations?to=' + D_TO,
      '/api/v1/reports/handovers?to=' + D_TO,
      '/api/v1/reports/expenses?to=' + D_TO,
      '/api/v1/reports/sales-vs-pos?to=' + D_TO,
      '/api/v1/reports/stock-movements?to=' + D_TO,
    ];
    for (const ep of eps) {
      const res = await m.get(ep);
      expect(res.status).toBe(400);
    }
  });

  it('from after to → 400', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/daily-sales?from=' + D_TO + '&to=' + D_FROM
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RANGE');
  });

  it('range > 366 days → 400', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/daily-sales?from=2020-01-01&to=2026-01-01'
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RANGE_TOO_LARGE');
  });

  it('malformed date → 400', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/daily-sales?from=not-a-date&to=' + D_TO
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ============ 1. Daily sales & cash position ============

describe('Reports — daily sales & cash position', () => {
  it('returns rows for D1 and D2 with correct totals', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/daily-sales?from=' + D_FROM + '&to=' + D_TO
    );
    expect(res.status).toBe(200);
    const byDate = new Map(
      res.body.rows.map((r: { businessDate: string }) => [r.businessDate, r])
    );
    const d1 = byDate.get(D1) as {
      salesTotal: string;
      cashSales: string;
      collectionsTotal: string;
      actualCash: string;
      cashDifference: string;
      handoverTotal: string;
      expenseTotal: string;
    };
    expect(d1).toBeTruthy();
    expect(d1.salesTotal).toBe('1000.00');
    expect(d1.cashSales).toBe('700.00');
    expect(d1.collectionsTotal).toBe('1000.00'); // 700 + 300
    expect(d1.actualCash).toBe('695.00');
    expect(d1.cashDifference).toBe('-5.00');
    expect(d1.handoverTotal).toBe('695.00');
    expect(d1.expenseTotal).toBe('100.00');

    const d2 = byDate.get(D2) as { salesTotal: string };
    expect(d2.salesTotal).toBe('500.00');
  });

  it('range excludes out-of-range dates', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/daily-sales?from=' + D1 + '&to=' + D1
    );
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].businessDate).toBe(D1);
  });

  it('empty range returns empty rows + zero totals', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/daily-sales?from=2019-01-01&to=2019-01-02'
    );
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(0);
    expect(res.body.totals.salesTotal).toBe('0.00');
    expect(res.body.totals.cashDifference).toBe('0.00');
    expect(res.body.totals.rowCount).toBe(0);
    expect(res.body.totals.collectionsTotal).toBe('0.00');
    expect(res.body.totals.collectionsCash).toBe('0.00');
    expect(res.body.totals.collectionsMobile).toBe('0.00');
  });

  it('totals reflect the full filtered range regardless of limit', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/daily-sales?from=' + D_FROM + '&to=' + D_TO + '&limit=1'
    );
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeLessThanOrEqual(1);
    // Total sales across D1 + D2 = 1500
    expect(res.body.totals.salesTotal).toBe('1500.00');
  });

  it('collections totals are present and split by payment bucket', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/daily-sales?from=' + D_FROM + '&to=' + D_TO
    );
    expect(res.status).toBe(200);

    const t = res.body.totals;
    expect(typeof t.collectionsTotal).toBe('string');
    expect(typeof t.collectionsCash).toBe('string');
    expect(typeof t.collectionsMobile).toBe('string');
    expect(t.collectionsTotal).toMatch(/^\d+\.\d{2}$/);
    expect(t.collectionsCash).toMatch(/^\d+\.\d{2}$/);
    expect(t.collectionsMobile).toMatch(/^\d+\.\d{2}$/);
  });
});

// ============ 2. Reconciliation summary ============

describe('Reports — reconciliation summary', () => {
  it('returns the seeded reconciliation', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/reconciliations?from=' + D_FROM + '&to=' + D_TO
    );
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].username).toBe(WAITER.username);
    expect(res.body.rows[0].cashDifference).toBe('-5.00');
    expect(res.body.rows[0].status).toBe('REVIEWED');
    expect(res.body.totals.count).toBe(1);
  });

  it('userId filter excludes other users', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/reconciliations?from=' +
        D_FROM +
        '&to=' +
        D_TO +
        '&userId=' +
        ownerId
    );
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(0);
  });
});

// ============ 3. Cash handover ledger ============

describe('Reports — cash handover ledger', () => {
  it('returns the seeded handover', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/handovers?from=' + D_FROM + '&to=' + D_TO
    );
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].amount).toBe('695.00');
    expect(res.body.rows[0].status).toBe('CONFIRMED');
    expect(res.body.totals.amount).toBe('695.00');
    expect(res.body.totals.confirmedCount).toBe(1);
    expect(res.body.totals.pendingCount).toBe(0);
  });

  it('status=PENDING returns zero rows', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/handovers?from=' +
        D_FROM +
        '&to=' +
        D_TO +
        '&status=PENDING'
    );
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(0);
  });
});

// ============ 4. Expense report ============

describe('Reports — expense report', () => {
  it('returns the seeded expense with correct totals', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/expenses?from=' + D_FROM + '&to=' + D_TO
    );
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].expenseNumber).toBe(EXPENSE_NUMBER);
    expect(res.body.totals.amount).toBe('100.00');
    expect(res.body.totals.cashAmount).toBe('100.00');
    expect(res.body.totals.nonCashAmount).toBe('0.00');
  });

  it('byCategory breakdown is present', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/expenses?from=' + D_FROM + '&to=' + D_TO
    );
    expect(res.status).toBe(200);
    const cats = res.body.totals.byCategory as Array<{
      categoryName: string;
      amount: string;
    }>;
    expect(cats).toHaveLength(1);
    expect(cats[0].categoryName).toBe(TEST_EXP_CAT);
    expect(cats[0].amount).toBe('100.00');
  });

  it('status=DRAFT returns zero rows for this fixture', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/expenses?from=' +
        D_FROM +
        '&to=' +
        D_TO +
        '&status=DRAFT'
    );
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(0);
  });
});

// ============ 5. Supplier balance report ============

describe('Reports — supplier balance', () => {
  it('returns our supplier with invoiced 750 and paid 200', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get('/api/v1/reports/supplier-balances');
    expect(res.status).toBe(200);
    const row = res.body.rows.find(
      (r: { supplierId: string }) => r.supplierId === supplierId
    );
    expect(row).toBeTruthy();
    // Two POSTED invoices: 500 + 250 = 750
    expect(row.totalInvoiced).toBe('750.00');
    // One payment: 200 (unallocated)
    expect(row.totalPaid).toBe('200.00');
    expect(row.totalAllocated).toBe('0.00');
    expect(row.totalUnallocated).toBe('200.00');
    // Balance = invoiced - allocated = 750 - 0 = 750
    expect(row.balance).toBe('750.00');
  });

  it('includeInactive=false is the default and both are accepted', async () => {
    const m = await loginAs(MANAGER);
    const a = await m.get('/api/v1/reports/supplier-balances');
    const b = await m.get('/api/v1/reports/supplier-balances?includeInactive=true');
    const c = await m.get('/api/v1/reports/supplier-balances?includeInactive=false');
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(c.status).toBe(200);
  });
});

// ============ 6. Sales vs POS summary ============

describe('Reports — sales vs POS', () => {
  it('D1 shows a -5.00 cash variance and 0 mobile variance', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/sales-vs-pos?from=' + D_FROM + '&to=' + D_TO
    );
    expect(res.status).toBe(200);
    const d1 = res.body.rows.find(
      (r: { businessDate: string }) => r.businessDate === D1
    ) as {
      posCash: string;
      collectionsCash: string;
      cashVariance: string;
      mobileVariance: string;
      isReconciled: boolean;
    };
    expect(d1).toBeTruthy();
    expect(d1.posCash).toBe('700.00');
    expect(d1.collectionsCash).toBe('700.00');
    expect(d1.cashVariance).toBe('0.00');
    expect(d1.mobileVariance).toBe('0.00');
    expect(d1.isReconciled).toBe(true);
  });

  it('D2 has no collections so cash variance is negative', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/sales-vs-pos?from=' + D_FROM + '&to=' + D_TO
    );
    expect(res.status).toBe(200);
    const d2 = res.body.rows.find(
      (r: { businessDate: string }) => r.businessDate === D2
    ) as {
      posCash: string;
      cashVariance: string;
      isReconciled: boolean;
    };
    expect(d2).toBeTruthy();
    expect(d2.posCash).toBe('500.00');
    expect(d2.cashVariance).toBe('-500.00');
    expect(d2.isReconciled).toBe(false);
  });
});

// ============ 7. Stock movements ledger ============

describe('Reports — stock movements ledger', () => {
  it('returns the two seeded movements for D1', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/stock-movements?from=' + D1 + '&to=' + D1
    );
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.totals.movementCount).toBe(2);
    expect(res.body.totals.totalIn).toBe('100.000');
    expect(res.body.totals.totalOut).toBe('30.000');
    expect(res.body.totals.netChange).toBe('70.000');
  });

  it('byType groups movements correctly', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/stock-movements?from=' + D1 + '&to=' + D1
    );
    const byType = res.body.totals.byType as Array<{
      type: string;
      count: number;
      totalIn: string;
      totalOut: string;
    }>;
    const open = byType.find((b) => b.type === 'OPENING')!;
    const cons = byType.find((b) => b.type === 'CONSUMPTION')!;
    expect(open.count).toBe(1);
    expect(open.totalIn).toBe('100.000');
    expect(open.totalOut).toBe('0.000');
    expect(cons.count).toBe(1);
    expect(cons.totalIn).toBe('0.000');
    expect(cons.totalOut).toBe('30.000');
  });

  it('materialId filter narrows results', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/stock-movements?from=' +
        D1 +
        '&to=' +
        D1 +
        '&materialId=' +
        materialId
    );
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(2);
  });
});

// ============ Precision + integrity ============

describe('Reports — precision and integrity', () => {
  it('does not leak rows outside the requested range', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/daily-sales?from=' + D1 + '&to=' + D1
    );
    expect(res.status).toBe(200);
    for (const row of res.body.rows) {
      expect(row.businessDate).toBe(D1);
    }
    // Should NOT include D_OUTSIDE (which has a POSTED invoice)
    expect(
      res.body.rows.some(
        (r: { businessDate: string }) => r.businessDate === D_OUTSIDE
      )
    ).toBe(false);
  });

  it('decimal aggregation is exact to two places', async () => {
    // Seed three tiny expenses via Prisma for exact-sum testing.
    const cat = await prisma.expenseCategory.findFirst({
      where: { name: TEST_EXP_CAT },
    });
    if (!cat) throw new Error('missing exp cat');

    const d = new Date('2025-03-20T00:00:00.000Z');
    const nums = ['0.01', '0.02', '0.04'];
    for (let i = 0; i < nums.length; i++) {
      await prisma.expense.create({
        data: {
          expenseNumber: 'EXP-P16-PREC-' + i,
          businessDate: d,
          categoryId: cat.id,
          createdBy: managerId,
          amount: nums[i],
          paymentMethod: 'CASH',
          description: 'precision test',
          status: 'APPROVED',
          approvedBy: ownerId,
          approvedAt: new Date(),
        },
      });
    }

    const m = await loginAs(MANAGER);
    const res = await m.get(
      '/api/v1/reports/expenses?from=2025-03-20&to=2025-03-20'
    );
    expect(res.status).toBe(200);
    // 0.01 + 0.02 + 0.04 = 0.07 exactly. Not 0.06999999.
    expect(res.body.totals.amount).toBe('0.07');

    // Cleanup the precision fixtures.
    await prisma.expense.deleteMany({
      where: { expenseNumber: { startsWith: 'EXP-P16-PREC-' } },
    });
  });
});
