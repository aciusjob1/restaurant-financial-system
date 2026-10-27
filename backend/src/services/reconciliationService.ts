import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { assertDayNotClosed } from './closedDayGuard.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import type { PaymentMethod, Prisma, ReconciliationStatus } from '@prisma/client';

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

async function handoverSumsForShifts(
  shiftIds: string[]
): Promise<Map<string, Prisma.Decimal>> {
  if (!shiftIds.length) return new Map();
  const rows = await prisma.cashHandover.findMany({
    where: { shiftId: { in: shiftIds }, voidedAt: null },
    select: { shiftId: true, amount: true },
  });
  const map = new Map<string, Prisma.Decimal>();
  for (const r of rows) {
    const cur = map.get(r.shiftId) ?? toDecimal('0');
    map.set(r.shiftId, cur.plus(r.amount));
  }
  return map;
}

async function handoverSumForShift(shiftId: string): Promise<Prisma.Decimal> {
  const rows = await prisma.cashHandover.findMany({
    where: { shiftId, voidedAt: null },
    select: { amount: true },
  });
  let sum = toDecimal('0');
  for (const r of rows) sum = sum.plus(r.amount);
  return sum;
}

async function assertShiftDayOpen(shiftId: string, actorRole: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR') {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: { businessDate: true },
  });
  if (!shift) throw new ApiError(404, 'SHIFT_NOT_FOUND', 'Shift not found.');
  await assertDayNotClosed(shift.businessDate, actorRole);
}

function serialize(r: {
  id: string;
  shiftId: string;
  userId: string;
  expectedCash: Prisma.Decimal;
  expectedMobile: Prisma.Decimal;
  actualCash: Prisma.Decimal | null;
  actualMobile: Prisma.Decimal | null;
  cashDifference: Prisma.Decimal | null;
  mobileDifference: Prisma.Decimal | null;
  status: ReconciliationStatus;
  notes: string | null;
  submittedAt: Date | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  user?: { id: string; fullName: string };
  shift?: { businessDate: Date };
}, handoverSum: Prisma.Decimal) {
  return {
    id: r.id,
    user: r.user ? { id: r.user.id, fullName: r.user.fullName } : null,
    shift: r.shift ? { businessDate: r.shift.businessDate } : null,
    shiftId: r.shiftId,
    userId: r.userId,
    expectedCash: toMoneyString(r.expectedCash),
    expectedMobile: toMoneyString(r.expectedMobile),
    actualCash: r.actualCash === null ? null : toMoneyString(r.actualCash),
    actualMobile: r.actualMobile === null ? null : toMoneyString(r.actualMobile),
    cashDifference: r.cashDifference === null ? null : toMoneyString(r.cashDifference),
    mobileDifference:
      r.mobileDifference === null ? null : toMoneyString(r.mobileDifference),
    receiptVariance:
      r.actualCash === null ? null : toMoneyString(handoverSum.minus(r.actualCash)),
    status: r.status,
    notes: r.notes,
    submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
    reviewedBy: r.reviewedBy,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    reviewNotes: r.reviewNotes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function computeExpected(shiftId: string): Promise<{
  expectedCash: Prisma.Decimal;
  expectedMobile: Prisma.Decimal;
}> {
  const rows = await prisma.collection.findMany({
    where: { shiftId, voidedAt: null },
    select: { paymentMethod: true, amount: true },
  });

  let cash = toDecimal('0');
  let mobile = toDecimal('0');
  for (const r of rows) {
    if (r.paymentMethod === 'CASH') cash = cash.plus(r.amount);
    else if (MOBILE_METHODS.has(r.paymentMethod)) mobile = mobile.plus(r.amount);
    // BANK, CARD, OTHER are deliberately excluded from reconciliation.
  }
  return { expectedCash: cash, expectedMobile: mobile };
}

export async function listReconciliations(opts: {
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' };
  shiftId?: string;
  userId?: string;
  status?: ReconciliationStatus;
}) {
  const where: Prisma.ReconciliationWhereInput = {};
  if (opts.actor.role === 'WAITER') {
    where.userId = opts.actor.id;
  } else if (opts.userId) {
    where.userId = opts.userId;
  }
  if (opts.shiftId) where.shiftId = opts.shiftId;
  if (opts.status) where.status = opts.status;

  const rows = await prisma.reconciliation.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
    include: { user: { select: { id: true, fullName: true } }, shift: { select: { businessDate: true } } },
  });
  const sums = await handoverSumsForShifts(rows.map((r) => r.shiftId));
  return rows.map((r) => serialize(r, sums.get(r.shiftId) ?? toDecimal('0')));
}

export async function getReconciliationById(
  id: string,
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' }
) {
  const row = await prisma.reconciliation.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Reconciliation not found.');
  if (actor.role === 'WAITER' && row.userId !== actor.id) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission.');
  }
  const handoverSum = await handoverSumForShift(row.shiftId);
  return serialize(row, handoverSum);
}

export async function createReconciliation(input: {
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' };
  shiftId: string;
  actualCash?: string;
  actualMobile?: string;
  notes: string | null;
}) {
  if (input.actor.role !== 'WAITER') {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Only the shift owner may create a reconciliation.'
    );
  }

  const shift = await prisma.shift.findUnique({ where: { id: input.shiftId } });
  if (!shift) throw new ApiError(404, 'SHIFT_NOT_FOUND', 'Shift not found.');
  if (shift.userId !== input.actor.id) {
    throw new ApiError(403, 'FORBIDDEN', 'That shift does not belong to you.');
  }

  // Duplicate detection comes first: once a reconciliation exists, retrying
  // must report that fact even if the shift has since moved on to RECONCILING.
  const existingForShift = await prisma.reconciliation.findFirst({
    where: { shiftId: input.shiftId },
    select: { id: true },
  });
  if (existingForShift) {
    throw new ApiError(
      409,
      'RECONCILIATION_EXISTS',
      'A reconciliation already exists for that shift.'
    );
  }

  if (shift.status !== 'SUBMITTED') {
    throw new ApiError(
      409,
      'SHIFT_NOT_SUBMITTED',
      'Shift must be SUBMITTED before creating a reconciliation.'
    );
  }

  await assertDayNotClosed(shift.businessDate, input.actor.role);

  const expected = await computeExpected(input.shiftId);

  const actualCash =
    input.actualCash !== undefined ? toDecimal(input.actualCash) : null;
  const actualMobile =
    input.actualMobile !== undefined ? toDecimal(input.actualMobile) : null;

  const cashDifference = actualCash === null ? null : actualCash.minus(expected.expectedCash);
  const mobileDifference =
    actualMobile === null ? null : actualMobile.minus(expected.expectedMobile);

  try {
    const row = await prisma.reconciliation.create({
      data: {
        shiftId: input.shiftId,
        userId: input.actor.id,
        expectedCash: expected.expectedCash,
        expectedMobile: expected.expectedMobile,
        actualCash,
        actualMobile,
        cashDifference,
        mobileDifference,
        notes: input.notes,
      },
    });
    const handoverSum = await handoverSumForShift(row.shiftId);
    return serialize(row, handoverSum);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(
        409,
        'RECONCILIATION_EXISTS',
        'A reconciliation already exists for that shift.'
      );
    }
    throw err;
  }
}

export async function updateReconciliation(input: {
  id: string;
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' };
  actualCash?: string;
  actualMobile?: string;
  notes?: string | null;
}) {
  const existing = await prisma.reconciliation.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Reconciliation not found.');

  if (input.actor.role !== 'WAITER' || existing.userId !== input.actor.id) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission.');
  }
  if (existing.status !== 'DRAFT') {
    throw new ApiError(
      409,
      'NOT_EDITABLE',
      `Reconciliation is not editable in status ${existing.status}.`
    );
  }

  await assertShiftDayOpen(existing.shiftId, input.actor.role);

  const actualCash =
    input.actualCash !== undefined ? toDecimal(input.actualCash) : existing.actualCash;
  const actualMobile =
    input.actualMobile !== undefined
      ? toDecimal(input.actualMobile)
      : existing.actualMobile;

  const cashDifference =
    actualCash === null ? null : actualCash.minus(existing.expectedCash);
  const mobileDifference =
    actualMobile === null ? null : actualMobile.minus(existing.expectedMobile);

  const row = await prisma.reconciliation.update({
    where: { id: input.id },
    data: {
      ...(input.actualCash !== undefined ? { actualCash } : {}),
      ...(input.actualMobile !== undefined ? { actualMobile } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      cashDifference,
      mobileDifference,
    },
  });
  const handoverSum = await handoverSumForShift(row.shiftId);
  return serialize(row, handoverSum);
}

export async function submitReconciliation(input: {
  id: string;
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' };
}) {
  const existing = await prisma.reconciliation.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Reconciliation not found.');

  if (input.actor.role !== 'WAITER' || existing.userId !== input.actor.id) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission.');
  }
  if (existing.status !== 'DRAFT') {
    throw new ApiError(
      409,
      'INVALID_TRANSITION',
      `Cannot submit a reconciliation in status ${existing.status}.`
    );
  }
  if (existing.actualCash === null || existing.actualMobile === null) {
    throw new ApiError(
      409,
      'ACTUALS_REQUIRED',
      'Enter both actualCash and actualMobile before submitting.'
    );
  }

  await assertShiftDayOpen(existing.shiftId, input.actor.role);

  const row = await prisma.reconciliation.update({
    where: { id: input.id },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
  });
  const handoverSum = await handoverSumForShift(row.shiftId);
  return serialize(row, handoverSum);
}

export async function reviewReconciliation(input: {
  id: string;
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' };
  decision: 'APPROVE' | 'SEND_BACK';
  reviewNotes?: string;
}) {
  if (input.actor.role !== 'MANAGER' && input.actor.role !== 'OWNER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only MANAGER or OWNER can review.');
  }

  const existing = await prisma.reconciliation.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Reconciliation not found.');

  // Separation of duties: a MANAGER cannot review their own submission.
  // OWNER is the final authority and may self-review to avoid deadlock.
  if (input.actor.role === 'MANAGER' && existing.createdBy === input.actor.id) {
    throw new ApiError(
      403,
      'SELF_REVIEW_FORBIDDEN',
      'A manager cannot review their own submission. Ask an owner to review.'
    );
  }

  if (existing.status !== 'SUBMITTED') {
    throw new ApiError(
      409,
      'INVALID_TRANSITION',
      `Only SUBMITTED reconciliations can be reviewed (currently ${existing.status}).`
    );
  }

  await assertShiftDayOpen(existing.shiftId, input.actor.role);

  const data: Prisma.ReconciliationUpdateInput =
    input.decision === 'APPROVE'
      ? {
          status: 'REVIEWED',
          reviewedBy: input.actor.id,
          reviewedAt: new Date(),
          reviewNotes: input.reviewNotes ?? null,
        }
      : {
          status: 'DRAFT',
          submittedAt: null,
          reviewNotes: input.reviewNotes ?? null,
        };

  const row = await prisma.reconciliation.update({
    where: { id: input.id },
    data,
  });
  const handoverSum = await handoverSumForShift(row.shiftId);
  return serialize(row, handoverSum);
}
