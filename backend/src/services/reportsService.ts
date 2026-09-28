import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import { parseBusinessDate, toDateOnly } from '../utils/businessDate.js';
import * as stockService from './stockMovementService.js';
import type {
  Prisma,
  ExpenseStatus,
  PaymentMethod,
  PurchaseInvoiceStatus,
  StockMovementDirection,
  StockMovementType,
} from '@prisma/client';

// ---------- shared helpers ----------

export type DateRange = { from: Date; to: Date };

const MAX_SPAN_DAYS = 366;

export function assertValidRange(fromStr: string, toStr: string): DateRange {
  const from = parseBusinessDate(fromStr);
  const to = parseBusinessDate(toStr);
  if (from.getTime() > to.getTime()) {
    throw new ApiError(400, 'INVALID_RANGE', 'from must be on or before to.');
  }
  const spanDays = Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  if (spanDays > MAX_SPAN_DAYS) {
    throw new ApiError(
      400,
      'RANGE_TOO_LARGE',
      `Date range must be at most ${MAX_SPAN_DAYS} days.`
    );
  }
  return { from, to };
}

function dateKey(d: Date): string {
  return toDateOnly(d);
}

const MOBILE_METHODS: ReadonlySet<string> = new Set([
  'MPESA',
  'AIRTEL_MONEY',
  'TIGO_PESA',
  'HALOPESA',
]);

function paymentBucket(method: string): 'CASH' | 'MOBILE' | 'OTHER' {
  if (method === 'CASH') return 'CASH';
  if (MOBILE_METHODS.has(method)) return 'MOBILE';
  return 'OTHER';
}

type DailyRow = {
  businessDate: string;
  salesTotal: Prisma.Decimal;
  cashSales: Prisma.Decimal;
  mobileSales: Prisma.Decimal;
  otherSales: Prisma.Decimal;
  collectionsTotal: Prisma.Decimal;
  collectionsCash: Prisma.Decimal;
  collectionsMobile: Prisma.Decimal;
  expectedCash: Prisma.Decimal;
  expectedMobile: Prisma.Decimal;
  actualCash: Prisma.Decimal;
  actualMobile: Prisma.Decimal;
  cashDifference: Prisma.Decimal;
  mobileDifference: Prisma.Decimal;
  handoverTotal: Prisma.Decimal;
  expenseTotal: Prisma.Decimal;
  closingStatus: string | null;
};

function makeDailyRow(key: string): DailyRow {
  return {
    businessDate: key,
    salesTotal: toDecimal('0'),
    cashSales: toDecimal('0'),
    mobileSales: toDecimal('0'),
    otherSales: toDecimal('0'),
    collectionsTotal: toDecimal('0'),
    collectionsCash: toDecimal('0'),
    collectionsMobile: toDecimal('0'),
    expectedCash: toDecimal('0'),
    expectedMobile: toDecimal('0'),
    actualCash: toDecimal('0'),
    actualMobile: toDecimal('0'),
    cashDifference: toDecimal('0'),
    mobileDifference: toDecimal('0'),
    handoverTotal: toDecimal('0'),
    expenseTotal: toDecimal('0'),
    closingStatus: null,
  };
}

function applyOffsetLimit<T>(rows: T[], offset: number, limit: number): T[] {
  return rows.slice(offset, offset + limit);
}

// ---------- 1. Daily Sales & Cash Position ----------

export async function dailySalesReport(
  range: DateRange,
  limit: number,
  offset: number
) {
  const { from, to } = range;

  const [sales, collections, recons, handovers, expenses, closings] =
    await Promise.all([
      prisma.salesSummary.findMany({
        where: { businessDate: { gte: from, lte: to } },
        select: {
          businessDate: true,
          totalSales: true,
          cashSales: true,
          mobileSales: true,
          otherSales: true,
        },
      }),
      prisma.collection.findMany({
        where: {
          voidedAt: null,
          shift: { businessDate: { gte: from, lte: to } },
        },
        select: {
          amount: true,
          paymentMethod: true,
          shift: { select: { businessDate: true } },
        },
      }),
      prisma.reconciliation.findMany({
        where: { shift: { businessDate: { gte: from, lte: to } } },
        select: {
          expectedCash: true,
          expectedMobile: true,
          actualCash: true,
          actualMobile: true,
          cashDifference: true,
          mobileDifference: true,
          shift: { select: { businessDate: true } },
        },
      }),
      prisma.cashHandover.findMany({
        where: {
          shift: { businessDate: { gte: from, lte: to } },
          voidedAt: null,
        },
        select: {
          amount: true,
          shift: {
            select: { businessDate: true },
          },
        },
      }),
      prisma.expense.findMany({
        where: {
          businessDate: { gte: from, lte: to },
          status: 'APPROVED',
        },
        select: { businessDate: true, amount: true },
      }),
      prisma.dailyClosing.findMany({
        where: {
          businessDate: { gte: from, lte: to },
          status: { not: 'SUPERSEDED' },
        },
        select: { businessDate: true, status: true, version: true },
        orderBy: [{ businessDate: 'asc' }, { version: 'desc' }],
      }),
    ]);

  const byDate = new Map<string, DailyRow>();
  const get = (k: string): DailyRow => {
    let r = byDate.get(k);
    if (!r) {
      r = makeDailyRow(k);
      byDate.set(k, r);
    }
    return r;
  };

  for (const s of sales) {
    const r = get(dateKey(s.businessDate));
    r.salesTotal = r.salesTotal.plus(s.totalSales);
    r.cashSales = r.cashSales.plus(s.cashSales);
    r.mobileSales = r.mobileSales.plus(s.mobileSales);
    r.otherSales = r.otherSales.plus(s.otherSales);
  }
  for (const c of collections) {
    const r = get(dateKey(c.shift.businessDate));
    r.collectionsTotal = r.collectionsTotal.plus(c.amount);
    const bucket = paymentBucket(c.paymentMethod);
    if (bucket === 'CASH') r.collectionsCash = r.collectionsCash.plus(c.amount);
    else if (bucket === 'MOBILE') r.collectionsMobile = r.collectionsMobile.plus(c.amount);
    // OTHER contributes to collectionsTotal only
  }
  for (const r0 of recons) {
    const r = get(dateKey(r0.shift.businessDate));
    r.expectedCash = r.expectedCash.plus(r0.expectedCash);
    r.expectedMobile = r.expectedMobile.plus(r0.expectedMobile);
    r.actualCash = r.actualCash.plus(r0.actualCash ?? toDecimal('0'));
    r.actualMobile = r.actualMobile.plus(r0.actualMobile ?? toDecimal('0'));
    r.cashDifference = r.cashDifference.plus(r0.cashDifference ?? toDecimal('0'));
    r.mobileDifference = r.mobileDifference.plus(
      r0.mobileDifference ?? toDecimal('0')
    );
  }
  for (const h of handovers) {
    const r = get(dateKey(h.shift.businessDate));
    r.handoverTotal = r.handoverTotal.plus(h.amount);
  }
  for (const e of expenses) {
    const r = get(dateKey(e.businessDate));
    r.expenseTotal = r.expenseTotal.plus(e.amount);
  }
  for (const c of closings) {
    const r = get(dateKey(c.businessDate));
    if (!r.closingStatus) r.closingStatus = c.status;
  }

  const allRows = [...byDate.values()].sort((a, b) =>
    a.businessDate.localeCompare(b.businessDate)
  );

  // Totals computed over the entire filtered range, NOT the paginated slice.
  const totals = allRows.reduce(
    (acc, r) => ({
      salesTotal: acc.salesTotal.plus(r.salesTotal),
      expenseTotal: acc.expenseTotal.plus(r.expenseTotal),
      cashDifference: acc.cashDifference.plus(r.cashDifference),
      mobileDifference: acc.mobileDifference.plus(r.mobileDifference),
      handoverTotal: acc.handoverTotal.plus(r.handoverTotal),
      collectionsTotal: acc.collectionsTotal.plus(r.collectionsTotal),
      collectionsCash: acc.collectionsCash.plus(r.collectionsCash),
      collectionsMobile: acc.collectionsMobile.plus(r.collectionsMobile),
    }),
    {
      salesTotal: toDecimal('0'),
      expenseTotal: toDecimal('0'),
      cashDifference: toDecimal('0'),
      mobileDifference: toDecimal('0'),
      handoverTotal: toDecimal('0'),
      collectionsTotal: toDecimal('0'),
      collectionsCash: toDecimal('0'),
      collectionsMobile: toDecimal('0'),
    }
  );

  const page = applyOffsetLimit(allRows, offset, limit);

  return {
    rows: page.map((r) => ({
      businessDate: r.businessDate,
      salesTotal: toMoneyString(r.salesTotal),
      cashSales: toMoneyString(r.cashSales),
      mobileSales: toMoneyString(r.mobileSales),
      otherSales: toMoneyString(r.otherSales),
      collectionsTotal: toMoneyString(r.collectionsTotal),
      collectionsCash: toMoneyString(r.collectionsCash),
      collectionsMobile: toMoneyString(r.collectionsMobile),
      expectedCash: toMoneyString(r.expectedCash),
      expectedMobile: toMoneyString(r.expectedMobile),
      actualCash: toMoneyString(r.actualCash),
      actualMobile: toMoneyString(r.actualMobile),
      cashDifference: toMoneyString(r.cashDifference),
      mobileDifference: toMoneyString(r.mobileDifference),
      handoverTotal: toMoneyString(r.handoverTotal),
      expenseTotal: toMoneyString(r.expenseTotal),
      closingStatus: r.closingStatus,
    })),
    totals: {
      salesTotal: toMoneyString(totals.salesTotal),
      expenseTotal: toMoneyString(totals.expenseTotal),
      cashDifference: toMoneyString(totals.cashDifference),
      mobileDifference: toMoneyString(totals.mobileDifference),
      handoverTotal: toMoneyString(totals.handoverTotal),
      collectionsTotal: toMoneyString(totals.collectionsTotal),
      collectionsCash: toMoneyString(totals.collectionsCash),
      collectionsMobile: toMoneyString(totals.collectionsMobile),
      rowCount: allRows.length,
    },
  };
}

// ---------- 2. Reconciliation Summary ----------

export async function reconciliationSummaryReport(
  range: DateRange,
  userId: string | undefined,
  limit: number,
  offset: number
) {
  const where: Prisma.ReconciliationWhereInput = {
    shift: { businessDate: { gte: range.from, lte: range.to } },
  };
  if (userId) where.userId = userId;

  const rows = await prisma.reconciliation.findMany({
    where,
    include: {
      shift: { select: { businessDate: true } },
      user: { select: { username: true, fullName: true } },
    },
    orderBy: [{ shift: { businessDate: 'desc' } }, { createdAt: 'desc' }],
    take: limit,
    skip: offset,
  });

  const totalsAgg = await prisma.reconciliation.aggregate({
    where,
    _sum: { cashDifference: true, mobileDifference: true },
    _count: { _all: true },
  });

  return {
    rows: rows.map((r) => ({
      id: r.id,
      businessDate: dateKey(r.shift.businessDate),
      userId: r.userId,
      username: r.user.username,
      fullName: r.user.fullName,
      shiftId: r.shiftId,
      expectedCash: toMoneyString(r.expectedCash),
      expectedMobile: toMoneyString(r.expectedMobile),
      actualCash: r.actualCash ? toMoneyString(r.actualCash) : null,
      actualMobile: r.actualMobile ? toMoneyString(r.actualMobile) : null,
      cashDifference: r.cashDifference ? toMoneyString(r.cashDifference) : null,
      mobileDifference: r.mobileDifference
        ? toMoneyString(r.mobileDifference)
        : null,
      status: r.status,
      submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    })),
    totals: {
      cashDifference: toMoneyString(totalsAgg._sum.cashDifference ?? toDecimal('0')),
      mobileDifference: toMoneyString(
        totalsAgg._sum.mobileDifference ?? toDecimal('0')
      ),
      count: totalsAgg._count._all,
    },
  };
}

// ---------- 3. Cash Handover Ledger ----------

export async function cashHandoverLedgerReport(
  range: DateRange,
  fromUserId: string | undefined,
  toUserId: string | undefined,
  status: string | undefined,
  limit: number,
  offset: number
) {
  const where: Prisma.CashHandoverWhereInput = {
    shift: { businessDate: { gte: range.from, lte: range.to } },
    voidedAt: null,
  };
  if (fromUserId) where.fromUserId = fromUserId;
  if (toUserId) where.toUserId = toUserId;
  if (status === 'PENDING' || status === 'CONFIRMED') where.status = status;

  const rows = await prisma.cashHandover.findMany({
    where,
    include: {
      fromUser: { select: { username: true, fullName: true } },
      toUser: { select: { username: true, fullName: true } },
      shift: {
        select: { businessDate: true },
      },
    },
    orderBy: [
      { shift: { businessDate: 'desc' } },
      { handedOverAt: 'desc' },
    ],
    take: limit,
    skip: offset,
  });

  const [sumAll, sumPending, sumConfirmed, countAgg] = await Promise.all([
    prisma.cashHandover.aggregate({ where, _sum: { amount: true } }),
    prisma.cashHandover.aggregate({
      where: { ...where, status: 'PENDING' },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.cashHandover.aggregate({
      where: { ...where, status: 'CONFIRMED' },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.cashHandover.count({ where }),
  ]);

  return {
    rows: rows.map((h) => ({
      id: h.id,
      businessDate: dateKey(h.shift.businessDate),
      reconciliationId: h.reconciliationId,
      fromUserId: h.fromUserId,
      fromUsername: h.fromUser.username,
      fromFullName: h.fromUser.fullName,
      toUserId: h.toUserId,
      toUsername: h.toUser.username,
      toFullName: h.toUser.fullName,
      amount: toMoneyString(h.amount),
      status: h.status,
      handedOverAt: h.handedOverAt.toISOString(),
      confirmedAt: h.confirmedAt ? h.confirmedAt.toISOString() : null,
    })),
    totals: {
      amount: toMoneyString(sumAll._sum.amount ?? toDecimal('0')),
      pendingCount: sumPending._count._all,
      pendingAmount: toMoneyString(sumPending._sum.amount ?? toDecimal('0')),
      confirmedCount: sumConfirmed._count._all,
      confirmedAmount: toMoneyString(sumConfirmed._sum.amount ?? toDecimal('0')),
      rowCount: countAgg,
    },
  };
}

// ---------- 4. Expense Report ----------

export async function expenseReport(
  range: DateRange,
  categoryId: string | undefined,
  status: ExpenseStatus | undefined,
  paymentMethod: PaymentMethod | undefined,
  limit: number,
  offset: number
) {
  const where: Prisma.ExpenseWhereInput = {
    businessDate: { gte: range.from, lte: range.to },
  };
  if (categoryId) where.categoryId = categoryId;
  if (status) where.status = status;
  if (paymentMethod) where.paymentMethod = paymentMethod;

  const rows = await prisma.expense.findMany({
    where,
    include: {
      category: { select: { name: true } },
      createdByUser: { select: { username: true } },
      approvedByUser: { select: { username: true } },
    },
    orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    skip: offset,
  });

  const [totalAgg, cashAgg, countAgg, byCategory] = await Promise.all([
    prisma.expense.aggregate({ where, _sum: { amount: true } }),
    prisma.expense.aggregate({
      where: { ...where, paymentMethod: 'CASH' },
      _sum: { amount: true },
    }),
    prisma.expense.count({ where }),
    prisma.expense.groupBy({
      by: ['categoryId'],
      where,
      _sum: { amount: true },
    }),
  ]);

  const categoryIds = byCategory.map((c) => c.categoryId);
  const categoryNames = await prisma.expenseCategory.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(categoryNames.map((c) => [c.id, c.name]));

  const total = totalAgg._sum.amount ?? toDecimal('0');
  const cash = cashAgg._sum.amount ?? toDecimal('0');
  const nonCash = total.minus(cash);

  return {
    rows: rows.map((e) => ({
      id: e.id,
      expenseNumber: e.expenseNumber,
      businessDate: dateKey(e.businessDate),
      categoryId: e.categoryId,
      categoryName: e.category.name,
      amount: toMoneyString(e.amount),
      paymentMethod: e.paymentMethod,
      description: e.description,
      status: e.status,
      createdByUsername: e.createdByUser.username,
      approvedByUsername: e.approvedByUser?.username ?? null,
      approvedAt: e.approvedAt ? e.approvedAt.toISOString() : null,
    })),
    totals: {
      amount: toMoneyString(total),
      cashAmount: toMoneyString(cash),
      nonCashAmount: toMoneyString(nonCash),
      rowCount: countAgg,
      byCategory: byCategory
        .map((c) => ({
          categoryId: c.categoryId,
          categoryName: nameById.get(c.categoryId) ?? '(unknown)',
          amount: toMoneyString(c._sum.amount ?? toDecimal('0')),
        }))
        .sort((a, b) => a.categoryName.localeCompare(b.categoryName)),
    },
  };
}

// ---------- 5. Supplier Balance Report ----------

export async function supplierBalanceReport(includeInactive: boolean) {
  const suppliers = await prisma.supplier.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
  });

  if (suppliers.length === 0) {
    return {
      rows: [],
      totals: { balance: '0.00', invoiced: '0.00', paid: '0.00' },
    };
  }

  const supplierIds = suppliers.map((s) => s.id);

  const [invoiced, paid, allocated] = await Promise.all([
    prisma.purchaseInvoice.groupBy({
      by: ['supplierId'],
      where: {
        supplierId: { in: supplierIds },
        status: { in: ['POSTED', 'CANCELLED'] as PurchaseInvoiceStatus[] },
      },
      _sum: { total: true },
    }),
    prisma.supplierPayment.groupBy({
      by: ['supplierId'],
      where: { supplierId: { in: supplierIds }, voidedAt: null },
      _sum: { amount: true },
    }),
    prisma.paymentAllocation.groupBy({
      by: ['purchaseInvoiceId'],
      where: {
        voidedAt: null,
        purchaseInvoice: { supplierId: { in: supplierIds } },
      },
      _sum: { amount: true },
    }),
  ]);

  const invoiceSupplierMap = await prisma.purchaseInvoice.findMany({
    where: { supplierId: { in: supplierIds } },
    select: { id: true, supplierId: true },
  });
  const invoiceToSupplier = new Map(
    invoiceSupplierMap.map((i) => [i.id, i.supplierId])
  );

  const invoicedBySup = new Map(
    invoiced.map((r) => [r.supplierId, r._sum.total ?? toDecimal('0')])
  );
  const paidBySup = new Map(
    paid.map((r) => [r.supplierId, r._sum.amount ?? toDecimal('0')])
  );

  // Sum allocations per supplier
  const allocBySup = new Map<string, Prisma.Decimal>();
  for (const a of allocated) {
    const supId = invoiceToSupplier.get(a.purchaseInvoiceId);
    if (!supId) continue;
    const cur = allocBySup.get(supId) ?? toDecimal('0');
    allocBySup.set(supId, cur.plus(a._sum.amount ?? toDecimal('0')));
  }

  let totalBalance = toDecimal('0');
  let totalInvoiced = toDecimal('0');
  let totalPaid = toDecimal('0');

  const rows = suppliers.map((s) => {
    const inv = invoicedBySup.get(s.id) ?? toDecimal('0');
    const pd = paidBySup.get(s.id) ?? toDecimal('0');
    const al = allocBySup.get(s.id) ?? toDecimal('0');
    const unalloc = pd.minus(al);
    const bal = inv.minus(al);
    totalBalance = totalBalance.plus(bal);
    totalInvoiced = totalInvoiced.plus(inv);
    totalPaid = totalPaid.plus(pd);
    return {
      supplierId: s.id,
      supplierNumber: s.supplierNumber,
      name: s.name,
      totalInvoiced: toMoneyString(inv),
      totalPaid: toMoneyString(pd),
      totalAllocated: toMoneyString(al),
      totalUnallocated: toMoneyString(unalloc),
      balance: toMoneyString(bal),
      isActive: s.isActive,
    };
  });

  return {
    rows,
    totals: {
      balance: toMoneyString(totalBalance),
      invoiced: toMoneyString(totalInvoiced),
      paid: toMoneyString(totalPaid),
    },
  };
}

// ---------- 6. Sales vs POS Summary ----------

export async function salesVsPosReport(
  range: DateRange,
  limit: number,
  offset: number
) {
  const { from, to } = range;

  const [sales, collections] = await Promise.all([
    prisma.salesSummary.findMany({
      where: { businessDate: { gte: from, lte: to } },
      select: {
        businessDate: true,
        totalSales: true,
        cashSales: true,
        mobileSales: true,
        otherSales: true,
      },
    }),
    prisma.collection.findMany({
      where: {
        voidedAt: null,
        shift: { businessDate: { gte: from, lte: to } },
      },
      select: {
        amount: true,
        paymentMethod: true,
        shift: { select: { businessDate: true } },
      },
    }),
  ]);

  type Row = {
    businessDate: string;
    posTotal: Prisma.Decimal;
    posCash: Prisma.Decimal;
    posMobile: Prisma.Decimal;
    posOther: Prisma.Decimal;
    collTotal: Prisma.Decimal;
    collCash: Prisma.Decimal;
    collMobile: Prisma.Decimal;
    collOther: Prisma.Decimal;
  };

  const byDate = new Map<string, Row>();
  const get = (k: string): Row => {
    let r = byDate.get(k);
    if (!r) {
      r = {
        businessDate: k,
        posTotal: toDecimal('0'),
        posCash: toDecimal('0'),
        posMobile: toDecimal('0'),
        posOther: toDecimal('0'),
        collTotal: toDecimal('0'),
        collCash: toDecimal('0'),
        collMobile: toDecimal('0'),
        collOther: toDecimal('0'),
      };
      byDate.set(k, r);
    }
    return r;
  };

  for (const s of sales) {
    const r = get(dateKey(s.businessDate));
    r.posTotal = r.posTotal.plus(s.totalSales);
    r.posCash = r.posCash.plus(s.cashSales);
    r.posMobile = r.posMobile.plus(s.mobileSales);
    r.posOther = r.posOther.plus(s.otherSales);
  }
  for (const c of collections) {
    const r = get(dateKey(c.shift.businessDate));
    r.collTotal = r.collTotal.plus(c.amount);
    const bucket = paymentBucket(c.paymentMethod);
    if (bucket === 'CASH') r.collCash = r.collCash.plus(c.amount);
    else if (bucket === 'MOBILE') r.collMobile = r.collMobile.plus(c.amount);
    else r.collOther = r.collOther.plus(c.amount);
  }

  const allRows = [...byDate.values()].sort((a, b) =>
    a.businessDate.localeCompare(b.businessDate)
  );

  const totals = allRows.reduce(
    (acc, r) => {
      acc.cashVariance = acc.cashVariance.plus(r.collCash.minus(r.posCash));
      acc.mobileVariance = acc.mobileVariance.plus(r.collMobile.minus(r.posMobile));
      acc.otherVariance = acc.otherVariance.plus(r.collOther.minus(r.posOther));
      return acc;
    },
    {
      cashVariance: toDecimal('0'),
      mobileVariance: toDecimal('0'),
      otherVariance: toDecimal('0'),
    }
  );

  const page = applyOffsetLimit(allRows, offset, limit);

  return {
    rows: page.map((r) => {
      const cashV = r.collCash.minus(r.posCash);
      const mobV = r.collMobile.minus(r.posMobile);
      const othV = r.collOther.minus(r.posOther);
      const reconciled = cashV.isZero() && mobV.isZero() && othV.isZero();
      return {
        businessDate: r.businessDate,
        posTotal: toMoneyString(r.posTotal),
        posCash: toMoneyString(r.posCash),
        posMobile: toMoneyString(r.posMobile),
        posOther: toMoneyString(r.posOther),
        collectionsTotal: toMoneyString(r.collTotal),
        collectionsCash: toMoneyString(r.collCash),
        collectionsMobile: toMoneyString(r.collMobile),
        collectionsOther: toMoneyString(r.collOther),
        cashVariance: toMoneyString(cashV),
        mobileVariance: toMoneyString(mobV),
        otherVariance: toMoneyString(othV),
        isReconciled: reconciled,
      };
    }),
    totals: {
      cashVariance: toMoneyString(totals.cashVariance),
      mobileVariance: toMoneyString(totals.mobileVariance),
      otherVariance: toMoneyString(totals.otherVariance),
      rowCount: allRows.length,
    },
  };
}

// ---------- 7. Stock Movements Ledger ----------

export async function stockMovementsLedgerReport(
  range: DateRange,
  materialId: string | undefined,
  type: StockMovementType | undefined,
  direction: StockMovementDirection | undefined,
  limit: number,
  offset: number
) {
  const fromStr = dateKey(range.from);
  const toStr = dateKey(range.to);

  // Rows use the same shape as /api/v1/stock-movements
  const rows = await stockService.listMovements({
    materialId,
    type,
    direction,
    from: fromStr,
    to: toStr,
    limit,
  });

  // Totals are computed over the entire range (not just the page).
  const where: Prisma.StockMovementWhereInput = {
    businessDate: { gte: range.from, lte: range.to },
  };
  if (materialId) where.materialId = materialId;
  if (type) where.type = type;
  if (direction) where.direction = direction;

  const all = await prisma.stockMovement.findMany({
    where,
    select: { type: true, direction: true, quantity: true },
  });

  let totalIn = toDecimal('0');
  let totalOut = toDecimal('0');
  const byTypeMap = new Map<
    string,
    { count: number; totalIn: Prisma.Decimal; totalOut: Prisma.Decimal }
  >();

  for (const m of all) {
    const entry = byTypeMap.get(m.type) ?? {
      count: 0,
      totalIn: toDecimal('0'),
      totalOut: toDecimal('0'),
    };
    entry.count += 1;
    if (m.direction === 'IN') {
      totalIn = totalIn.plus(m.quantity);
      entry.totalIn = entry.totalIn.plus(m.quantity);
    } else {
      totalOut = totalOut.plus(m.quantity);
      entry.totalOut = entry.totalOut.plus(m.quantity);
    }
    byTypeMap.set(m.type, entry);
  }

  const netChange = totalIn.minus(totalOut);

  // Attach material names for display. The underlying movement rows only
  // carry materialId; the UI needs the human-readable name.
  const materialIds = [...new Set(rows.map((r) => r.materialId))];
  const materials = materialIds.length
    ? await prisma.material.findMany({
        where: { id: { in: materialIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(materials.map((m) => [m.id, m.name]));

  return {
    rows: rows.map((r) => ({ ...r, materialName: nameById.get(r.materialId) ?? null })),
    totals: {
      totalIn: totalIn.toFixed(3),
      totalOut: totalOut.toFixed(3),
      netChange: netChange.toFixed(3),
      movementCount: all.length,
      byType: [...byTypeMap.entries()]
        .map(([t, v]) => ({
          type: t,
          count: v.count,
          totalIn: v.totalIn.toFixed(3),
          totalOut: v.totalOut.toFixed(3),
        }))
        .sort((a, b) => a.type.localeCompare(b.type)),
    },
  };
}