import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import { parseBusinessDate, toDateOnly } from '../utils/businessDate.js';
import type { DailyClosingStatus, PaymentMethod, Prisma } from '@prisma/client';

const MOBILE_METHODS: ReadonlySet<PaymentMethod> = new Set([
  'MPESA',
  'AIRTEL_MONEY',
  'TIGO_PESA',
  'HALOPESA',
]);

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}

function serialize(c: {
  id: string;
  businessDate: Date;
  version: number;
  status: DailyClosingStatus;
  salesSummaryTotal: Prisma.Decimal;
  salesSummaryCash: Prisma.Decimal;
  salesSummaryMobile: Prisma.Decimal;
  salesSummaryOther: Prisma.Decimal;
  expectedCash: Prisma.Decimal;
  expectedMobile: Prisma.Decimal;
  actualCash: Prisma.Decimal;
  actualMobile: Prisma.Decimal;
  cashDifference: Prisma.Decimal;
  mobileDifference: Prisma.Decimal;
  cashSalesDiscrepancy: Prisma.Decimal;
  mobileSalesDiscrepancy: Prisma.Decimal;
  otherSalesDiscrepancy: Prisma.Decimal;
  totalHandovers: number;
  totalHandoverAmount: Prisma.Decimal;
  pendingHandoverCount: number;
  pendingHandoverAmount: Prisma.Decimal;
  confirmedHandoverCount: number;
  confirmedHandoverAmount: Prisma.Decimal;
  shiftCount: number;
  reconciliationCount: number;
  pendingReviewCount: number;
  totalExpenses: Prisma.Decimal;
  totalCashExpenses: Prisma.Decimal;
  snapshotJson: Prisma.JsonValue;
  closedBy: string;
  closedAt: Date;
  reopenedBy: string | null;
  reopenedAt: Date | null;
  reopenReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    businessDate: toDateOnly(c.businessDate),
    version: c.version,
    status: c.status,
    salesSummaryTotal: toMoneyString(c.salesSummaryTotal),
    salesSummaryCash: toMoneyString(c.salesSummaryCash),
    salesSummaryMobile: toMoneyString(c.salesSummaryMobile),
    salesSummaryOther: toMoneyString(c.salesSummaryOther),
    expectedCash: toMoneyString(c.expectedCash),
    expectedMobile: toMoneyString(c.expectedMobile),
    actualCash: toMoneyString(c.actualCash),
    actualMobile: toMoneyString(c.actualMobile),
    cashDifference: toMoneyString(c.cashDifference),
    mobileDifference: toMoneyString(c.mobileDifference),
    cashSalesDiscrepancy: toMoneyString(c.cashSalesDiscrepancy),
    mobileSalesDiscrepancy: toMoneyString(c.mobileSalesDiscrepancy),
    otherSalesDiscrepancy: toMoneyString(c.otherSalesDiscrepancy),
    totalHandovers: c.totalHandovers,
    totalHandoverAmount: toMoneyString(c.totalHandoverAmount),
    pendingHandoverCount: c.pendingHandoverCount,
    pendingHandoverAmount: toMoneyString(c.pendingHandoverAmount),
    confirmedHandoverCount: c.confirmedHandoverCount,
    confirmedHandoverAmount: toMoneyString(c.confirmedHandoverAmount),
    shiftCount: c.shiftCount,
    reconciliationCount: c.reconciliationCount,
    pendingReviewCount: c.pendingReviewCount,
    totalExpenses: toMoneyString(c.totalExpenses),
    totalCashExpenses: toMoneyString(c.totalCashExpenses),
    snapshotJson: c.snapshotJson,
    closedBy: c.closedBy,
    closedAt: c.closedAt.toISOString(),
    reopenedBy: c.reopenedBy,
    reopenedAt: c.reopenedAt ? c.reopenedAt.toISOString() : null,
    reopenReason: c.reopenReason,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

interface ComputeResult {
  salesSummaryTotal: Prisma.Decimal;
  salesSummaryCash: Prisma.Decimal;
  salesSummaryMobile: Prisma.Decimal;
  salesSummaryOther: Prisma.Decimal;
  expectedCash: Prisma.Decimal;
  expectedMobile: Prisma.Decimal;
  actualCash: Prisma.Decimal;
  actualMobile: Prisma.Decimal;
  cashDifference: Prisma.Decimal;
  mobileDifference: Prisma.Decimal;
  cashSalesDiscrepancy: Prisma.Decimal;
  mobileSalesDiscrepancy: Prisma.Decimal;
  otherSalesDiscrepancy: Prisma.Decimal;
  totalHandovers: number;
  totalHandoverAmount: Prisma.Decimal;
  pendingHandoverCount: number;
  pendingHandoverAmount: Prisma.Decimal;
  confirmedHandoverCount: number;
  confirmedHandoverAmount: Prisma.Decimal;
  shiftCount: number;
  reconciliationCount: number;
  pendingReviewCount: number;
  totalExpenses: Prisma.Decimal;
  totalCashExpenses: Prisma.Decimal;
  snapshotJson: Record<string, unknown>;
}

async function computeClosing(businessDate: Date): Promise<ComputeResult> {
  // Closing is driven by the day's sales. Shifts are recorded for context
  // only and do NOT have to be CLOSED (or even exist): a business that
  // records sales without the shift workflow can still close its day.
  const shifts = await prisma.shift.findMany({
    where: { businessDate },
    select: { id: true, status: true, userId: true },
  });

  const shiftIds = shifts.map((s) => s.id);
  const shiftCount = shifts.length;
  const openShiftCount = shifts.filter((s) => s.status !== 'CLOSED').length;

  // 1. SalesSummary totals for the date (POS view) - the basis for closing.
  const summaries = await prisma.salesSummary.findMany({
    where: { businessDate },
    select: {
      id: true,
      source: true,
      sourceReference: true,
      totalSales: true,
      cashSales: true,
      mobileSales: true,
      otherSales: true,
    },
  });
  let ssTotal = toDecimal('0');
  let ssCash = toDecimal('0');
  let ssMobile = toDecimal('0');
  let ssOther = toDecimal('0');
  for (const s of summaries) {
    ssTotal = ssTotal.plus(s.totalSales);
    ssCash = ssCash.plus(s.cashSales);
    ssMobile = ssMobile.plus(s.mobileSales);
    ssOther = ssOther.plus(s.otherSales);
  }
  const hasSalesSummaries = summaries.length > 0;

  // 2. Collections (waiter view), used for the POS <-> waiter discrepancies
  // and as the expected-cash fallback for days without POS summaries.
  const collections = shiftIds.length
    ? await prisma.collection.findMany({
        where: { shiftId: { in: shiftIds }, voidedAt: null },
        select: { id: true, paymentMethod: true, amount: true, userId: true },
      })
    : [];

  let colCash = toDecimal('0');
  let colMobile = toDecimal('0');
  let colOther = toDecimal('0');
  for (const c of collections) {
    if (c.paymentMethod === 'CASH') colCash = colCash.plus(c.amount);
    else if (MOBILE_METHODS.has(c.paymentMethod)) colMobile = colMobile.plus(c.amount);
    else colOther = colOther.plus(c.amount);
  }

  // 3. Daily cash receipts: the manager-confirmed cash handed over by each
  // waiter. These are the primary actual-cash source on a sales-only day.
  const receipts = await prisma.dailyCashReceipt.findMany({
    where: { businessDate },
    select: { id: true, userId: true, status: true, amountReceived: true },
  });

  let receiptCash = toDecimal('0');
  let decidedReceiptCount = 0;
  let pendingReceiptCount = 0;
  for (const r of receipts) {
    if (r.status === 'PENDING') {
      pendingReceiptCount += 1;
      continue;
    }
    decidedReceiptCount += 1;
    if (
      (r.status === 'APPROVED' || r.status === 'INSUFFICIENT') &&
      r.amountReceived !== null
    ) {
      receiptCash = receiptCash.plus(r.amountReceived);
    }
    // NO_NETCASH_HANDED_OVER contributes zero cash.
  }

  // 4. Reconciliation actuals (shift workflow). Used as the cash fallback
  // when no receipt has been decided for the date, and always for mobile.
  const reconciliations = shiftIds.length
    ? await prisma.reconciliation.findMany({
        where: { shiftId: { in: shiftIds } },
        select: {
          id: true,
          shiftId: true,
          userId: true,
          status: true,
          actualCash: true,
          actualMobile: true,
          cashDifference: true,
          mobileDifference: true,
        },
      })
    : [];

  let reconCash = toDecimal('0');
  let reconMobile = toDecimal('0');
  let reconciliationCount = 0;
  let pendingReconciliationCount = 0;

  for (const r of reconciliations) {
    if (r.status === 'SUBMITTED' || r.status === 'REVIEWED') {
      reconciliationCount += 1;
      if (r.actualCash !== null) reconCash = reconCash.plus(r.actualCash);
      if (r.actualMobile !== null) reconMobile = reconMobile.plus(r.actualMobile);
    }
    if (r.status === 'SUBMITTED') pendingReconciliationCount += 1;
  }

  const actualCashSource = decidedReceiptCount > 0 ? 'RECEIPTS' : 'RECONCILIATIONS';
  const actCash = decidedReceiptCount > 0 ? receiptCash : reconCash;
  const actMobile = reconMobile;
  const pendingReviewCount = pendingReconciliationCount + pendingReceiptCount;

  // 5. Handovers for these shifts (Model 2: shift-anchored, voided excluded).
  const handovers = shiftIds.length
    ? await prisma.cashHandover.findMany({
        where: { shiftId: { in: shiftIds }, voidedAt: null },
        select: { id: true, amount: true, status: true },
      })
    : [];

  let totalHandoverAmount = toDecimal('0');
  let pendingHandoverCount = 0;
  let pendingHandoverAmount = toDecimal('0');
  let confirmedHandoverCount = 0;
  let confirmedHandoverAmount = toDecimal('0');
  for (const h of handovers) {
    totalHandoverAmount = totalHandoverAmount.plus(h.amount);
    if (h.status === 'PENDING') {
      pendingHandoverCount += 1;
      pendingHandoverAmount = pendingHandoverAmount.plus(h.amount);
    } else {
      confirmedHandoverCount += 1;
      confirmedHandoverAmount = confirmedHandoverAmount.plus(h.amount);
    }
  }

  // 5b. Expense totals for the day (approved, not voided).
  const expenseRows = await prisma.expense.findMany({
    where: {
      businessDate,
      status: 'APPROVED',
      voidedAt: null,
    },
    select: { amount: true, paymentMethod: true },
  });
  let totalExpenses = toDecimal('0');
  let totalCashExpenses = toDecimal('0');
  for (const e of expenseRows) {
    totalExpenses = totalExpenses.plus(e.amount);
    if (e.paymentMethod === 'CASH') totalCashExpenses = totalCashExpenses.plus(e.amount);
  }

  // 6. Expected drawer cash. Sales-based: cash sales minus approved cash
  // expenses. Only when the day has no POS summary at all do we fall back to
  // the waiter collections, so older shift-only days still close sensibly.
  const expectedCash = (hasSalesSummaries ? ssCash : colCash).minus(totalCashExpenses);
  const expectedMobile = hasSalesSummaries ? ssMobile : colMobile;

  // Differences are always actual - expected, whichever sources were used.
  const cashDifference = actCash.minus(expectedCash);
  const mobileDifference = actMobile.minus(expectedMobile);

  // 7. Discrepancies between the POS view and the waiter view.
  const cashSalesDiscrepancy = ssCash.minus(colCash);
  const mobileSalesDiscrepancy = ssMobile.minus(colMobile);
  const otherSalesDiscrepancy = ssOther.minus(colOther);

  const snapshotJson = {
    businessDate: toDateOnly(businessDate),
    expectedCashBasis: hasSalesSummaries ? 'SALES' : 'COLLECTIONS',
    actualCashSource,
    openShiftCount,
    shifts: shifts.map((s) => ({ id: s.id, userId: s.userId, status: s.status })),
    salesSummaries: summaries.map((s) => ({
      id: s.id,
      source: s.source,
      sourceReference: s.sourceReference,
      totalSales: toMoneyString(s.totalSales),
      cashSales: toMoneyString(s.cashSales),
      mobileSales: toMoneyString(s.mobileSales),
      otherSales: toMoneyString(s.otherSales),
    })),
    collectionsTotal: collections.length,
    receipts: receipts.map((r) => ({
      id: r.id,
      userId: r.userId,
      status: r.status,
      amountReceived: r.amountReceived === null ? null : toMoneyString(r.amountReceived),
    })),
    reconciliations: reconciliations.map((r) => ({
      id: r.id,
      shiftId: r.shiftId,
      userId: r.userId,
      status: r.status,
      actualCash: r.actualCash === null ? null : toMoneyString(r.actualCash),
      actualMobile: r.actualMobile === null ? null : toMoneyString(r.actualMobile),
    })),
    handovers: handovers.map((h) => ({
      id: h.id,
      amount: toMoneyString(h.amount),
      status: h.status,
    })),
  };

  return {
    salesSummaryTotal: ssTotal,
    salesSummaryCash: ssCash,
    salesSummaryMobile: ssMobile,
    salesSummaryOther: ssOther,
    expectedCash,
    expectedMobile,
    actualCash: actCash,
    actualMobile: actMobile,
    cashDifference,
    mobileDifference,
    cashSalesDiscrepancy,
    mobileSalesDiscrepancy,
    otherSalesDiscrepancy,
    totalHandovers: handovers.length,
    totalHandoverAmount,
    pendingHandoverCount,
    pendingHandoverAmount,
    confirmedHandoverCount,
    confirmedHandoverAmount,
    shiftCount,
    reconciliationCount,
    pendingReviewCount,
    totalExpenses,
    totalCashExpenses,
    snapshotJson,
  };
}

export async function listClosings(opts: {
  businessDate?: string;
  status?: DailyClosingStatus;
}) {
  const where: Prisma.DailyClosingWhereInput = {};
  if (opts.businessDate) where.businessDate = parseBusinessDate(opts.businessDate);
  if (opts.status) where.status = opts.status;

  const rows = await prisma.dailyClosing.findMany({
    where,
    orderBy: [{ businessDate: 'desc' }, { version: 'desc' }],
    take: 200,
  });
  return rows.map(serialize);
}

export async function getClosingById(id: string) {
  const row = await prisma.dailyClosing.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Daily closing not found.');
  return serialize(row);
}

export async function createClosing(input: {
  businessDate: string;
  actorId: string;
}) {
  const businessDate = parseBusinessDate(input.businessDate);

  const existingClosed = await prisma.dailyClosing.findFirst({
    where: { businessDate, status: 'CLOSED' },
  });
  if (existingClosed) {
    throw new ApiError(
      409,
      'ALREADY_CLOSED',
      'This business date already has an active CLOSED version.'
    );
  }

  const computed = await computeClosing(businessDate);

  const previousMax = await prisma.dailyClosing.findFirst({
    where: { businessDate },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const nextVersion = (previousMax?.version ?? 0) + 1;

  try {
    const row = await prisma.dailyClosing.create({
      data: {
        businessDate,
        version: nextVersion,
        status: 'CLOSED',
        ...computed,
        snapshotJson: computed.snapshotJson as Prisma.InputJsonValue,
        closedBy: input.actorId,
      },
    });
    return serialize(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(
        409,
        'VERSION_CONFLICT',
        'A concurrent closing was created for this date. Reload and try again.'
      );
    }
    throw err;
  }
}

export async function reopenClosing(input: {
  id: string;
  actorId: string;
  reason: string;
}) {
  const existing = await prisma.dailyClosing.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Daily closing not found.');
  if (existing.status !== 'CLOSED') {
    throw new ApiError(
      409,
      'NOT_ACTIVE_CLOSING',
      `Only the active CLOSED version can be reopened (currently ${existing.status}).`
    );
  }

  const row = await prisma.dailyClosing.update({
    where: { id: input.id },
    data: {
      status: 'REOPENED',
      reopenedBy: input.actorId,
      reopenedAt: new Date(),
      reopenReason: input.reason,
    },
  });
  return serialize(row);
}