import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { parseBusinessDate } from '../utils/businessDate.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import type { DailyCashStatus, Prisma } from '@prisma/client';

const MOBILE_METHODS: ReadonlySet<string> = new Set([
  'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA', 'HALOPESA',
]);

function normalizeAmount(s: string): string {
  return toDecimal(s).toFixed(2);
}

export function buildSubmissionFingerprint(input: {
  mpesaEntries: Array<{ payerName: string; amount: string }>;
  expenses: Array<{ description: string; amount: string }>;
}): string {
  const mpesa = input.mpesaEntries
    .map((m) => [m.payerName.trim(), normalizeAmount(m.amount)] as const)
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const expenses = input.expenses
    .map((e) => [e.description.trim(), normalizeAmount(e.amount)] as const)
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return JSON.stringify({ mpesa, expenses });
}

async function computeExpectedNet(
  tx: Prisma.TransactionClient,
  userId: string,
  businessDate: Date
): Promise<Prisma.Decimal> {
  const summaries = await tx.salesSummary.findMany({
    where: { userId, businessDate },
    select: { totalSales: true, mobileSales: true, otherSales: true },
  });
  let totalSales = toDecimal('0');
  let mobileSales = toDecimal('0');
  let otherSales = toDecimal('0');
  for (const s of summaries) {
    totalSales = totalSales.plus(s.totalSales);
    mobileSales = mobileSales.plus(s.mobileSales);
    otherSales = otherSales.plus(s.otherSales);
  }
  const expenses = await tx.expense.findMany({
    where: { businessDate, createdBy: userId, status: 'APPROVED', voidedAt: null },
    select: { amount: true },
  });
  let expensesTotal = toDecimal('0');
  for (const e of expenses) expensesTotal = expensesTotal.plus(e.amount);
  return totalSales.minus(mobileSales).minus(otherSales).minus(expensesTotal);
}

export async function markSubmissionPending(
  tx: Prisma.TransactionClient,
  input: { userId: string; businessDate: Date; actorId: string; fingerprint: string }
): Promise<void> {
  const row = await tx.dailyCashReceipt.upsert({
    where: {
      userId_businessDate: { userId: input.userId, businessDate: input.businessDate },
    },
    create: {
      userId: input.userId,
      businessDate: input.businessDate,
      status: 'PENDING',
      createdBy: input.actorId,
      submissionFingerprint: input.fingerprint,
    },
    update: {},
  });

  if (row.submissionFingerprint === input.fingerprint) return;

  const latest = await tx.dailyCashReceiptDecision.findFirst({
    where: { receiptId: row.id, invalidatedAt: null },
    orderBy: { decidedAt: 'desc' },
  });
  if (latest) {
    await tx.dailyCashReceiptDecision.update({
      where: { id: latest.id },
      data: {
        invalidatedAt: new Date(),
        invalidatedReason: 'Waiter resubmitted with different figures',
      },
    });
  }

  await tx.dailyCashReceipt.update({
    where: { id: row.id },
    data: {
      status: 'PENDING',
      amountReceived: null,
      decidedBy: null,
      decidedAt: null,
      submissionFingerprint: input.fingerprint,
    },
  });
}

export async function listForDate(businessDateInput: string) {
  const businessDate = parseBusinessDate(businessDateInput);

  const summaries = await prisma.salesSummary.findMany({
    where: { businessDate, userId: { not: null } },
    select: {
      userId: true,
      totalSales: true,
      mobileSales: true,
      cashSales: true,
      otherSales: true,
      user: { select: { id: true, fullName: true } },
    },
  });

  const userIds = Array.from(new Set(summaries.map((s) => s.userId!).filter(Boolean)));
  if (userIds.length === 0) return [];

  type Sums = {
    totalSales: Prisma.Decimal;
    mobileSales: Prisma.Decimal;
    otherSales: Prisma.Decimal;
    cashSales: Prisma.Decimal;
    waiterName: string;
  };
  const sumsByUser = new Map<string, Sums>();
  for (const s of summaries) {
    const uid = s.userId!;
    const cur = sumsByUser.get(uid) ?? {
      totalSales: toDecimal('0'),
      mobileSales: toDecimal('0'),
      otherSales: toDecimal('0'),
      cashSales: toDecimal('0'),
      waiterName: s.user?.fullName ?? uid.slice(0, 8),
    };
    cur.totalSales = cur.totalSales.plus(s.totalSales);
    cur.mobileSales = cur.mobileSales.plus(s.mobileSales);
    cur.otherSales = cur.otherSales.plus(s.otherSales);
    cur.cashSales = cur.cashSales.plus(s.cashSales);
    sumsByUser.set(uid, cur);
  }

  const shifts = await prisma.shift.findMany({
    where: { businessDate, userId: { in: userIds } },
    select: { id: true, userId: true },
  });
  const shiftIds = shifts.map((s) => s.id);
  const shiftToUser = new Map(shifts.map((s) => [s.id, s.userId]));

  const collections = shiftIds.length
    ? await prisma.collection.findMany({
        where: { shiftId: { in: shiftIds }, voidedAt: null },
        select: { shiftId: true, paymentMethod: true, amount: true },
      })
    : [];

  type Bucket = {
    cash: Prisma.Decimal;
    mobile: Prisma.Decimal;
    other: Prisma.Decimal;
    total: Prisma.Decimal;
  };
  const collectedByUser = new Map<string, Bucket>();
  for (const c of collections) {
    const uid = shiftToUser.get(c.shiftId);
    if (!uid) continue;
    let b = collectedByUser.get(uid);
    if (!b) {
      b = { cash: toDecimal('0'), mobile: toDecimal('0'), other: toDecimal('0'), total: toDecimal('0') };
      collectedByUser.set(uid, b);
    }
    b.total = b.total.plus(c.amount);
    if (c.paymentMethod === 'CASH') b.cash = b.cash.plus(c.amount);
    else if (MOBILE_METHODS.has(c.paymentMethod)) b.mobile = b.mobile.plus(c.amount);
    else b.other = b.other.plus(c.amount);
  }

  const expenseRows = await prisma.expense.findMany({
    where: { businessDate, status: 'APPROVED', voidedAt: null, createdBy: { in: userIds } },
    select: { createdBy: true, amount: true },
  });
  const expensesByUser = new Map<string, Prisma.Decimal>();
  for (const e of expenseRows) {
    const cur = expensesByUser.get(e.createdBy) ?? toDecimal('0');
    expensesByUser.set(e.createdBy, cur.plus(e.amount));
  }

  const receipts = await prisma.dailyCashReceipt.findMany({
    where: { businessDate, userId: { in: userIds } },
  });
  const receiptByUser = new Map(receipts.map((r) => [r.userId, r]));

  return userIds.map((uid) => {
    const sums = sumsByUser.get(uid)!;
    const col = collectedByUser.get(uid)
      ?? { cash: toDecimal('0'), mobile: toDecimal('0'), other: toDecimal('0'), total: toDecimal('0') };
    const expensesTotal = expensesByUser.get(uid) ?? toDecimal('0');
    // Expected net cash = what the drawer should hold. Sales minus the
    // money that did not go into the drawer вЂ” M-Pesa and other non-cash
    // collections, as actually collected вЂ” minus the cash expenses the
    // waiter recorded. The waiter's kiosk shows the same number.
    const expectedNet = sums.totalSales
      .minus(col.mobile)
      .minus(col.other)
      .minus(expensesTotal);
    const receipt = receiptByUser.get(uid);

    return {
      userId: uid,
      waiterName: sums.waiterName,
      businessDate: businessDateInput,
      sales: toMoneyString(sums.totalSales),
      mobileSales: toMoneyString(sums.mobileSales),
      otherSales: toMoneyString(sums.otherSales),
      cashSales: toMoneyString(sums.cashSales),
      collectedTotal: toMoneyString(col.total),
      collectedCash: toMoneyString(col.cash),
      collectedMobile: toMoneyString(col.mobile),
      collectedOther: toMoneyString(col.other),
      expensesTotal: toMoneyString(expensesTotal),
      expectedNet: toMoneyString(expectedNet),
      receipt: receipt
        ? {
            id: receipt.id,
            status: receipt.status,
            amountReceived: receipt.amountReceived === null ? null : toMoneyString(receipt.amountReceived),
            decidedBy: receipt.decidedBy,
            decidedAt: receipt.decidedAt?.toISOString() ?? null,
            createdAt: receipt.createdAt.toISOString(),
            updatedAt: receipt.updatedAt.toISOString(),
          }
        : null,
    };
  });
}

export async function upsertReceipt(input: {
  userId: string;
  businessDate: string;
  status: DailyCashStatus;
  amountReceived: string | null;
  actorId: string;
  expectedUpdatedAt: string;
}) {
  const businessDate = parseBusinessDate(input.businessDate);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.dailyCashReceipt.findUnique({
      where: { userId_businessDate: { userId: input.userId, businessDate } },
    });
    if (!existing) {
      throw new ApiError(409, 'NO_SUBMISSION', 'No collection submission exists for this waiter and date.');
    }

    if (existing.updatedAt.toISOString() !== input.expectedUpdatedAt) {
      throw new ApiError(409, 'STALE_RECEIPT',
        'This row changed since you loaded it. Reload and try again.');
    }

    const expectedNet = await computeExpectedNet(tx, input.userId, businessDate);
    const submittedAmount = input.amountReceived === null ? null : toDecimal(input.amountReceived);

    let finalAmount: Prisma.Decimal | null = null;

    if (input.status === 'APPROVED') {
      if (expectedNet.isNegative()) {
        throw new ApiError(400, 'STATUS_NOT_ALLOWED_FOR_NET',
          'Expected net cash is ' + toMoneyString(expectedNet) + '; cannot mark as approved.');
      }
      finalAmount = submittedAmount ?? expectedNet;
      if (!finalAmount.equals(expectedNet)) {
        throw new ApiError(409, 'AMOUNT_MISMATCH',
          'Approved amount must equal expected net cash (' + toMoneyString(expectedNet) + ').');
      }
    } else if (input.status === 'INSUFFICIENT') {
      if (expectedNet.lessThanOrEqualTo(0)) {
        throw new ApiError(400, 'STATUS_NOT_ALLOWED_FOR_NET',
          'Expected net cash is ' + toMoneyString(expectedNet) + '; insufficient does not apply.');
      }
      if (submittedAmount === null) {
        throw new ApiError(400, 'AMOUNT_REQUIRED', 'INSUFFICIENT requires amountReceived.');
      }
      if (submittedAmount.greaterThanOrEqualTo(expectedNet)) {
        throw new ApiError(400, 'NOT_INSUFFICIENT',
          'Amount received is not less than expected net cash (' + toMoneyString(expectedNet) + ').');
      }
      finalAmount = submittedAmount;
    } else {
      if (submittedAmount !== null) {
        throw new ApiError(400, 'AMOUNT_NOT_ALLOWED',
          'NO_NETCASH_HANDED_OVER must not include an amount.');
      }
      finalAmount = null;
    }

    const updated = await tx.dailyCashReceipt.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        amountReceived: finalAmount,
        decidedBy: input.actorId,
        decidedAt: now,
      },
    });

    await tx.dailyCashReceiptDecision.create({
      data: {
        receiptId: existing.id,
        status: input.status,
        amountReceived: finalAmount,
        decidedBy: input.actorId,
        decidedAt: now,
      },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      businessDate: input.businessDate,
      status: updated.status,
      amountReceived: updated.amountReceived === null ? null : toMoneyString(updated.amountReceived),
      decidedBy: updated.decidedBy,
      decidedAt: updated.decidedAt?.toISOString() ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    };
  });
}

/**
 * Returns the calling user's own receipt for a date, or null if none
 * exists. Used by the kiosk to display the manager's decision on the
 * waiter's most recent submission. Returns no other user's row.
 */
export async function getMyReceiptForDate(userId: string, businessDateInput: string) {
  const businessDate = parseBusinessDate(businessDateInput);
  const row = await prisma.dailyCashReceipt.findUnique({
    where: { userId_businessDate: { userId, businessDate } },
    select: {
      id: true,
      status: true,
      amountReceived: true,
      decidedAt: true,
      updatedAt: true,
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    businessDate: businessDateInput,
    status: row.status,
    amountReceived: row.amountReceived === null ? null : toMoneyString(row.amountReceived),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}