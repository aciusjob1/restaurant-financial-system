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
  snapshotJson: Record<string, unknown>;
}

async function computeClosing(businessDate: Date): Promise<ComputeResult> {
  // 1. Every shift for the date must be CLOSED. Decision 2 (C).
  const shifts = await prisma.shift.findMany({
    where: { businessDate },
    select: { id: true, status: true, userId: true },
  });
  const notClosed = shifts.filter((s) => s.status !== 'CLOSED');
  if (notClosed.length > 0) {
    throw new ApiError(
      409,
      'SHIFTS_NOT_CLOSED',
      `Cannot close the day: ${notClosed.length} shift(s) are not CLOSED.`
    );
  }

  const shiftIds = shifts.map((s) => s.id);
  const shiftCount = shifts.length;

  // 2. SalesSummary totals for the date (POS view).
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

  // 3. Collections-derived expected values (waiter view).
  const collections = shiftIds.length
    ? await prisma.collection.findMany({
        where: { shiftId: { in: shiftIds }, voidedAt: null },
        select: { id: true, paymentMethod: true, amount: true, userId: true },
      })
    : [];

  let expCash = toDecimal('0');
  let expMobile = toDecimal('0');
  let colOther = toDecimal('0');
  for (const c of collections) {
    if (c.paymentMethod === 'CASH') expCash = expCash.plus(c.amount);
    else if (MOBILE_METHODS.has(c.paymentMethod)) expMobile = expMobile.plus(c.amount);
    else colOther = colOther.plus(c.amount);
  }

  // 4. Reconciliation-derived actuals.
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

  let actCash = toDecimal('0');
  let actMobile = toDecimal('0');
  let cashDiff = toDecimal('0');
  let mobileDiff = toDecimal('0');
  let reconciliationCount = 0;
  let pendingReviewCount = 0;

  for (const r of reconciliations) {
    if (r.status === 'SUBMITTED' || r.status === 'REVIEWED') {
      reconciliationCount += 1;
      if (r.actualCash !== null) actCash = actCash.plus(r.actualCash);
      if (r.actualMobile !== null) actMobile = actMobile.plus(r.actualMobile);
      if (r.cashDifference !== null) cashDiff = cashDiff.plus(r.cashDifference);
      if (r.mobileDifference !== null) mobileDiff = mobileDiff.plus(r.mobileDifference);
    }
    if (r.status === 'SUBMITTED') pendingReviewCount += 1;
  }

  // 5. Handovers for these reconciliations.
  const reconIds = reconciliations.map((r) => r.id);
  const handovers = reconIds.length
    ? await prisma.cashHandover.findMany({
        where: { reconciliationId: { in: reconIds } },
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

  // 6. Discrepancies between the POS view and the waiter view.
  const cashSalesDiscrepancy = ssCash.minus(expCash);
  const mobileSalesDiscrepancy = ssMobile.minus(expMobile);
  const otherSalesDiscrepancy = ssOther.minus(colOther);

  const snapshotJson = {
    businessDate: toDateOnly(businessDate),
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
    expectedCash: expCash,
    expectedMobile: expMobile,
    actualCash: actCash,
    actualMobile: actMobile,
    cashDifference: cashDiff,
    mobileDifference: mobileDiff,
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