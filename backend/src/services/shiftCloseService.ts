import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import { assertDayNotClosed } from './closedDayGuard.js';
import { nextExpenseNumber } from './expenseService.js';
import type { PaymentMethod, Role } from '@prisma/client';

const MOBILE_METHODS: ReadonlySet<PaymentMethod> = new Set([
  'MPESA',
  'AIRTEL_MONEY',
  'TIGO_PESA',
  'HALOPESA',
]);

type CollectionInput = {
  cash?: string;
  mpesa?: string;
  airtelMoney?: string;
  tigoPesa?: string;
  halopesa?: string;
  bank?: string;
  card?: string;
  other?: string;
};

type ExpenseInput = {
  categoryId: string;
  amount: string;
  paymentMethod: PaymentMethod;
  description: string;
  notes?: string | null;
  paidByUserId?: string | null;
};

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}

export async function closeMoney(input: {
  actor: { id: string; role: Role };
  shiftId: string;
  collections: CollectionInput;
  expenses?: ExpenseInput[];
  cashHandedOver: string;
  receivedByUserId: string;
  notes?: string | null;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can close a shift money picture.');
  }

  const shift = await prisma.shift.findUnique({
    where: { id: input.shiftId },
    include: { reconciliation: { select: { id: true } } },
  });
  if (!shift) throw new ApiError(404, 'SHIFT_NOT_FOUND', 'Shift not found.');
  if (shift.status !== 'OPEN') {
    throw new ApiError(
      409,
      'SHIFT_NOT_OPEN',
      'Shift must be OPEN to close (currently ' + shift.status + ').'
    );
  }
  if (shift.reconciliation) {
    throw new ApiError(
      409,
      'RECONCILIATION_EXISTS',
      'This shift already has a reconciliation.'
    );
  }

  // Q1: refuse if the waiter has already recorded events on this shift.
  const existingCollections = await prisma.collection.count({
    where: { shiftId: input.shiftId, voidedAt: null },
  });
  if (existingCollections > 0) {
    throw new ApiError(
      409,
      'COLLECTIONS_EXIST',
      'This shift already has recorded collections. Use the reconciliation flow instead.'
    );
  }

  if (shift.openingCash === null) {
    throw new ApiError(
      409,
      'OPENING_CASH_REQUIRED',
      'Declare opening cash before closing the shift money picture.'
    );
  }

  await assertDayNotClosed(shift.businessDate, input.actor.role);

  const receiver = await prisma.user.findUnique({
    where: { id: input.receivedByUserId },
  });
  if (!receiver) throw new ApiError(400, 'INVALID_RECEIVER', 'Receiver does not exist.');
  if (receiver.role !== 'MANAGER' && receiver.role !== 'OWNER') {
    throw new ApiError(400, 'INVALID_RECEIVER', 'Receiver must be a MANAGER or OWNER.');
  }

  const expenseInputs = input.expenses ?? [];
  const categoryIds = Array.from(new Set(expenseInputs.map((e) => e.categoryId)));
  if (categoryIds.length > 0) {
    const cats = await prisma.expenseCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, isActive: true },
    });
    const found = new Map(cats.map((c) => [c.id, c]));
    for (const id of categoryIds) {
      const c = found.get(id);
      if (!c) throw new ApiError(400, 'INVALID_CATEGORY', 'Category ' + id + ' does not exist.');
      if (!c.isActive) throw new ApiError(400, 'CATEGORY_INACTIVE', 'Category ' + id + ' is not active.');
    }
  }

  const paidByIds = Array.from(
    new Set(
      expenseInputs
        .map((e) => e.paidByUserId)
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    )
  );
  if (paidByIds.length > 0) {
    const paidByUsers = await prisma.user.findMany({
      where: { id: { in: paidByIds } },
      select: { id: true, isActive: true },
    });
    const paidByFound = new Map(paidByUsers.map((u) => [u.id, u]));
    for (const id of paidByIds) {
      const u = paidByFound.get(id);
      if (!u) throw new ApiError(400, 'INVALID_PAID_BY', 'Paid-by user ' + id + ' does not exist.');
      if (!u.isActive) throw new ApiError(400, 'INVALID_PAID_BY', 'Paid-by user ' + id + ' is not active.');
    }
  }

  const methodMap: Array<[PaymentMethod, string | undefined]> = [
    ['CASH', input.collections.cash],
    ['MPESA', input.collections.mpesa],
    ['AIRTEL_MONEY', input.collections.airtelMoney],
    ['TIGO_PESA', input.collections.tigoPesa],
    ['HALOPESA', input.collections.halopesa],
    ['BANK', input.collections.bank],
    ['CARD', input.collections.card],
    ['OTHER', input.collections.other],
  ];
  const collectionRows = methodMap
    .filter(([, amt]) => {
      if (amt === undefined || amt === null) return false;
      const n = parseFloat(amt);
      return !Number.isNaN(n) && n > 0;
    })
    .map(([method, amt]) => ({ method, amount: toDecimal(amt as string) }));

  if (collectionRows.length === 0 && expenseInputs.length === 0) {
    throw new ApiError(400, 'NOTHING_TO_CLOSE', 'Provide at least one collection or expense.');
  }

  let cashCollected = toDecimal('0');
  let mobileCollected = toDecimal('0');
  for (const r of collectionRows) {
    if (r.method === 'CASH') cashCollected = cashCollected.plus(r.amount);
    else if (MOBILE_METHODS.has(r.method)) mobileCollected = mobileCollected.plus(r.amount);
  }

  let cashExpenses = toDecimal('0');
  for (const e of expenseInputs) {
    if (e.paymentMethod === 'CASH') cashExpenses = cashExpenses.plus(toDecimal(e.amount));
  }

  const openingCash = shift.openingCash ?? toDecimal('0');
  const expectedCash = openingCash.plus(cashCollected).minus(cashExpenses);
  const expectedMobile = mobileCollected;

  const actualCash = toDecimal(input.cashHandedOver);
  const actualMobile = expectedMobile;
  const cashDifference = actualCash.minus(expectedCash);
  const mobileDifference = toDecimal('0');

  // Owner preferences: read fresh from the DB so a PATCH to
  // /auth/me takes effect on the next call without a session
  // refresh. Only queried when the actor is OWNER - MANAGER
  // paths pay nothing.
  const ownerPref = input.actor.role === 'OWNER'
    ? await prisma.user.findUnique({
        where: { id: input.actor.id },
        select: {
          autoApproveExpenses: true,
          autoReviewReconciliations: true,
          autoConfirmHandovers: true,
        },
      })
    : null;
  const ownerAutoApprove = ownerPref?.autoApproveExpenses === true;
  const ownerAutoReview = ownerPref?.autoReviewReconciliations === true;
  const ownerAutoConfirm = ownerPref?.autoConfirmHandovers === true;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      for (const r of collectionRows) {
        await tx.collection.create({
          data: {
            shiftId: shift.id,
            userId: shift.userId,
            createdById: input.actor.id,
            paymentMethod: r.method,
            amount: r.amount,
            mobileReference: null,
            notes: null,
          },
        });
      }

      let expenseCount = 0;
      for (const e of expenseInputs) {
        const expenseNumber = await nextExpenseNumber(tx);
        await tx.expense.create({
          data: {
            expenseNumber,
            businessDate: shift.businessDate,
            categoryId: e.categoryId,
            shiftId: shift.id,
            paidByUserId: e.paidByUserId ?? shift.userId,
            amount: toDecimal(e.amount),
            paymentMethod: e.paymentMethod,
            description: e.description,
            notes: e.notes ?? null,
            createdBy: input.actor.id,
            status: ownerAutoApprove ? 'APPROVED' : 'PENDING',
            submittedAt: now,
            approvedBy: ownerAutoApprove ? input.actor.id : null,
            approvedAt: ownerAutoApprove ? now : null,
          },
        });
        expenseCount += 1;
      }

      const recon = await tx.reconciliation.create({
        data: {
          shiftId: shift.id,
          userId: shift.userId,
          createdBy: input.actor.id,
          expectedCash,
          expectedMobile,
          actualCash,
          actualMobile,
          cashDifference,
          mobileDifference,
          status: ownerAutoReview ? 'REVIEWED' : 'SUBMITTED',
          notes: input.notes ?? null,
          submittedAt: now,
          reviewedBy: ownerAutoReview ? input.actor.id : null,
          reviewedAt: ownerAutoReview ? now : null,
        },
      });

      const handover = await tx.cashHandover.create({
        data: {
          shiftId: shift.id,
          reconciliationId: recon.id,
          fromUserId: shift.userId,
          toUserId: input.receivedByUserId,
          createdById: input.actor.id,
          amount: actualCash,
          status: (input.actor.role !== 'OWNER' || ownerAutoConfirm) ? 'CONFIRMED' : 'PENDING',
          confirmedAt: (input.actor.role !== 'OWNER' || ownerAutoConfirm) ? now : null,
          notes: input.notes ?? null,
        },
      });

      await tx.shift.update({
        where: { id: shift.id },
        data: {
          status: 'SUBMITTED',
          submittedAt: now,
        },
      });

      return { recon, handover, expenseCount };
    });

    return {
      reconciliation: {
        id: result.recon.id,
        shiftId: result.recon.shiftId,
        expectedCash: toMoneyString(expectedCash),
        expectedMobile: toMoneyString(expectedMobile),
        actualCash: toMoneyString(actualCash),
        actualMobile: toMoneyString(actualMobile),
        cashDifference: toMoneyString(cashDifference),
        mobileDifference: toMoneyString(mobileDifference),
        status: result.recon.status,
      },
      handover: {
        id: result.handover.id,
        amount: toMoneyString(actualCash),
        status: result.handover.status,
      },
      created: {
        collections: collectionRows.length,
        expenses: result.expenseCount,
      },
    };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, 'RECONCILIATION_EXISTS', 'A reconciliation already exists for that shift.');
    }
    throw err;
  }
}

export async function completeShift(input: {
  actor: { id: string; role: Role };
  shiftId: string;
  expenses?: ExpenseInput[];
  cashHandedOver: string;
  receivedByUserId: string;
  notes?: string | null;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can complete a shift.');
  }

  const shift = await prisma.shift.findUnique({
    where: { id: input.shiftId },
    include: { reconciliation: { select: { id: true } } },
  });
  if (!shift) throw new ApiError(404, 'SHIFT_NOT_FOUND', 'Shift not found.');
  if (shift.status !== 'OPEN') {
    throw new ApiError(
      409,
      'SHIFT_NOT_OPEN',
      'Shift must be OPEN to complete (currently ' + shift.status + ').'
    );
  }
  if (shift.reconciliation) {
    throw new ApiError(
      409,
      'RECONCILIATION_EXISTS',
      'This shift already has a reconciliation.'
    );
  }

  // Inverse of close-money: REQUIRE existing non-voided collections.
  const existingCollections = await prisma.collection.findMany({
    where: { shiftId: input.shiftId, voidedAt: null },
    select: { paymentMethod: true, amount: true },
  });
  if (existingCollections.length === 0) {
    throw new ApiError(
      400,
      'NO_COLLECTIONS',
      'This shift has no non-voided collections. Use close-money instead.'
    );
  }

  if (shift.openingCash === null) {
    throw new ApiError(
      409,
      'OPENING_CASH_REQUIRED',
      'Declare opening cash before completing the shift.'
    );
  }

  await assertDayNotClosed(shift.businessDate, input.actor.role);

  const receiver = await prisma.user.findUnique({
    where: { id: input.receivedByUserId },
  });
  if (!receiver) throw new ApiError(400, 'INVALID_RECEIVER', 'Receiver does not exist.');
  if (receiver.role !== 'MANAGER' && receiver.role !== 'OWNER') {
    throw new ApiError(400, 'INVALID_RECEIVER', 'Receiver must be a MANAGER or OWNER.');
  }

  const expenseInputs = input.expenses ?? [];
  const categoryIds = Array.from(new Set(expenseInputs.map((e) => e.categoryId)));
  if (categoryIds.length > 0) {
    const cats = await prisma.expenseCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, isActive: true },
    });
    const found = new Map(cats.map((c) => [c.id, c]));
    for (const id of categoryIds) {
      const c = found.get(id);
      if (!c) throw new ApiError(400, 'INVALID_CATEGORY', 'Category ' + id + ' does not exist.');
      if (!c.isActive) throw new ApiError(400, 'CATEGORY_INACTIVE', 'Category ' + id + ' is not active.');
    }
  }

  const paidByIds = Array.from(
    new Set(
      expenseInputs
        .map((e) => e.paidByUserId)
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    )
  );
  if (paidByIds.length > 0) {
    const paidByUsers = await prisma.user.findMany({
      where: { id: { in: paidByIds } },
      select: { id: true, isActive: true },
    });
    const paidByFound = new Map(paidByUsers.map((u) => [u.id, u]));
    for (const id of paidByIds) {
      const u = paidByFound.get(id);
      if (!u) throw new ApiError(400, 'INVALID_PAID_BY', 'Paid-by user ' + id + ' does not exist.');
      if (!u.isActive) throw new ApiError(400, 'INVALID_PAID_BY', 'Paid-by user ' + id + ' is not active.');
    }
  }

  let cashCollected = toDecimal('0');
  let mobileCollected = toDecimal('0');
  for (const c of existingCollections) {
    if (c.paymentMethod === 'CASH') cashCollected = cashCollected.plus(c.amount);
    else if (MOBILE_METHODS.has(c.paymentMethod)) mobileCollected = mobileCollected.plus(c.amount);
  }

  let cashExpenses = toDecimal('0');
  for (const e of expenseInputs) {
    if (e.paymentMethod === 'CASH') cashExpenses = cashExpenses.plus(toDecimal(e.amount));
  }

  const openingCash = shift.openingCash;
  const expectedCash = openingCash.plus(cashCollected).minus(cashExpenses);
  const expectedMobile = mobileCollected;

  const actualCash = toDecimal(input.cashHandedOver);
  const actualMobile = expectedMobile;
  const cashDifference = actualCash.minus(expectedCash);
  const mobileDifference = toDecimal('0');

  // Owner preferences: read fresh from the DB so a PATCH to
  // /auth/me takes effect on the next call without a session
  // refresh. Only queried when the actor is OWNER - MANAGER
  // paths pay nothing.
  const ownerPref = input.actor.role === 'OWNER'
    ? await prisma.user.findUnique({
        where: { id: input.actor.id },
        select: {
          autoApproveExpenses: true,
          autoReviewReconciliations: true,
          autoConfirmHandovers: true,
        },
      })
    : null;
  const ownerAutoApprove = ownerPref?.autoApproveExpenses === true;
  const ownerAutoReview = ownerPref?.autoReviewReconciliations === true;
  const ownerAutoConfirm = ownerPref?.autoConfirmHandovers === true;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();

      let expenseCount = 0;
      for (const e of expenseInputs) {
        const expenseNumber = await nextExpenseNumber(tx);
        await tx.expense.create({
          data: {
            expenseNumber,
            businessDate: shift.businessDate,
            categoryId: e.categoryId,
            shiftId: shift.id,
            paidByUserId: e.paidByUserId ?? shift.userId,
            amount: toDecimal(e.amount),
            paymentMethod: e.paymentMethod,
            description: e.description,
            notes: e.notes ?? null,
            createdBy: input.actor.id,
            status: ownerAutoApprove ? 'APPROVED' : 'PENDING',
            submittedAt: now,
            approvedBy: ownerAutoApprove ? input.actor.id : null,
            approvedAt: ownerAutoApprove ? now : null,
          },
        });
        expenseCount += 1;
      }

      const recon = await tx.reconciliation.create({
        data: {
          shiftId: shift.id,
          userId: shift.userId,
          createdBy: input.actor.id,
          expectedCash,
          expectedMobile,
          actualCash,
          actualMobile,
          cashDifference,
          mobileDifference,
          status: ownerAutoReview ? 'REVIEWED' : 'SUBMITTED',
          notes: input.notes ?? null,
          submittedAt: now,
          reviewedBy: ownerAutoReview ? input.actor.id : null,
          reviewedAt: ownerAutoReview ? now : null,
        },
      });

      const handover = await tx.cashHandover.create({
        data: {
          shiftId: shift.id,
          reconciliationId: recon.id,
          fromUserId: shift.userId,
          toUserId: input.receivedByUserId,
          createdById: input.actor.id,
          amount: actualCash,
          status: (input.actor.role !== 'OWNER' || ownerAutoConfirm) ? 'CONFIRMED' : 'PENDING',
          confirmedAt: (input.actor.role !== 'OWNER' || ownerAutoConfirm) ? now : null,
          notes: input.notes ?? null,
        },
      });

      await tx.shift.update({
        where: { id: shift.id },
        data: {
          status: 'SUBMITTED',
          submittedAt: now,
        },
      });

      return { recon, handover, expenseCount };
    });

    return {
      reconciliation: {
        id: result.recon.id,
        shiftId: result.recon.shiftId,
        expectedCash: toMoneyString(expectedCash),
        expectedMobile: toMoneyString(expectedMobile),
        actualCash: toMoneyString(actualCash),
        actualMobile: toMoneyString(actualMobile),
        cashDifference: toMoneyString(cashDifference),
        mobileDifference: toMoneyString(mobileDifference),
        status: result.recon.status,
      },
      handover: {
        id: result.handover.id,
        amount: toMoneyString(actualCash),
        status: result.handover.status,
      },
      created: {
        collections: 0,
        expenses: result.expenseCount,
      },
    };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, 'RECONCILIATION_EXISTS', 'A reconciliation already exists for that shift.');
    }
    throw err;
  }
}
