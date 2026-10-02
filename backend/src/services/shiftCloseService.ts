import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import { assertDayNotClosed } from './closedDayGuard.js';
import { nextExpenseNumber } from '../utils/expenseNumber.js';
import { applySalaryExpense } from './salaryService.js';
import type { PaymentMethod, Role, Prisma } from '@prisma/client';

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
  salaryTargetEmployeeId?: string | null;
};

type ShiftCloseMode = 'close-money' | 'complete-shift' | 'submit';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}

async function runShiftClose(
  input: {
    actor: { id: string; role: Role };
    shiftId: string;
    collections?: CollectionInput;
    expenses?: ExpenseInput[];
    cashHandedOver: string;
    receivedByUserId?: string;
    notes?: string | null;
  },
  mode: ShiftCloseMode
) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can close a shift.');
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

  // Load existing non-voided collections. All modes need them.
  const existingCollections = await prisma.collection.findMany({
    where: { shiftId: input.shiftId, voidedAt: null },
    select: { paymentMethod: true, amount: true },
  });

  // Mode-specific gate on existing collections.
  if (mode === 'close-money' && existingCollections.length > 0) {
    throw new ApiError(
      409,
      'COLLECTIONS_EXIST',
      'This shift already has recorded collections. Use the reconciliation flow instead.'
    );
  }
  if (mode === 'complete-shift' && existingCollections.length === 0) {
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
      'Declare opening cash before closing the shift money picture.'
    );
  }

  await assertDayNotClosed(shift.businessDate, input.actor.role);

  // No receiver validation here. This endpoint is only reachable by
  // MANAGER/OWNER. The waiter kiosk path creates its own handover via
  // POST /handovers.

  const expenseInputs = input.expenses ?? [];
  const categoryIds = Array.from(new Set(expenseInputs.map((e) => e.categoryId)));
  const categoryByKey = new Map<string, { id: string; isActive: boolean; systemKey: string | null }>();
  if (categoryIds.length > 0) {
    const cats = await prisma.expenseCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, isActive: true, systemKey: true },
    });
    for (const c of cats) categoryByKey.set(c.id, c);
    for (const id of categoryIds) {
      const c = categoryByKey.get(id);
      if (!c) throw new ApiError(400, 'INVALID_CATEGORY', 'Category ' + id + ' does not exist.');
      if (!c.isActive) throw new ApiError(400, 'CATEGORY_INACTIVE', 'Category ' + id + ' is not active.');
    }
  }

  // Salary expenses submitted via a shift auto-target the shift owner.
  // Resolve Employee.userId === shift.userId once; error if missing.
  const hasSalaryExpense = expenseInputs.some(
    (e) => categoryByKey.get(e.categoryId)?.systemKey === 'SALARY'
  );
  let salaryTargetEmployeeId: string | null = null;
  if (hasSalaryExpense) {
    const emp = await prisma.employee.findFirst({
      where: { userId: shift.userId },
      select: { id: true, isActive: true },
    });
    if (!emp) {
      throw new ApiError(
        409,
        'NO_EMPLOYEE_FOR_SHIFT',
        'The shift owner has no linked Employee record. Link a User to an Employee before recording a salary expense from this shift.'
      );
    }
    if (!emp.isActive) {
      throw new ApiError(409, 'EMPLOYEE_INACTIVE', 'The shift owner Employee record is not active.');
    }
    salaryTargetEmployeeId = emp.id;
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

  // New collection rows to create from input.collections (if any).
  const methodMap: Array<[PaymentMethod, string | undefined]> = [
    ['CASH', input.collections?.cash],
    ['MPESA', input.collections?.mpesa],
    ['AIRTEL_MONEY', input.collections?.airtelMoney],
    ['TIGO_PESA', input.collections?.tigoPesa],
    ['HALOPESA', input.collections?.halopesa],
    ['BANK', input.collections?.bank],
    ['CARD', input.collections?.card],
    ['OTHER', input.collections?.other],
  ];
  const newCollectionRows = methodMap
    .filter(([, amt]) => {
      if (amt === undefined || amt === null) return false;
      const n = parseFloat(amt);
      return !Number.isNaN(n) && n > 0;
    })
    .map(([method, amt]) => ({ method, amount: toDecimal(amt as string) }));

  // Mode-specific 'nothing to do' guards.
  if (mode === 'close-money' && newCollectionRows.length === 0 && expenseInputs.length === 0) {
    throw new ApiError(400, 'NOTHING_TO_CLOSE', 'Provide at least one collection or expense.');
  }
  if (
    mode === 'submit' &&
    existingCollections.length === 0 &&
    newCollectionRows.length === 0
  ) {
    throw new ApiError(
      400,
      'NO_COLLECTIONS',
      'Provide at least one collection to submit this shift.'
    );
  }

  // Combined collected totals: existing + new.
  let cashCollected = toDecimal('0');
  let mobileCollected = toDecimal('0');
  for (const c of existingCollections) {
    if (c.paymentMethod === 'CASH') cashCollected = cashCollected.plus(c.amount);
    else if (MOBILE_METHODS.has(c.paymentMethod)) mobileCollected = mobileCollected.plus(c.amount);
  }
  for (const r of newCollectionRows) {
    if (r.method === 'CASH') cashCollected = cashCollected.plus(r.amount);
    else if (MOBILE_METHODS.has(r.method)) mobileCollected = mobileCollected.plus(r.amount);
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

  // Owner preferences: read fresh from the DB.
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

  try {
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();

      // Create NEW collection rows only. Existing rows are never touched.
      for (const r of newCollectionRows) {
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
        const isSalaryRow = categoryByKey.get(e.categoryId)?.systemKey === 'SALARY';
        const targetEmployeeId = isSalaryRow ? salaryTargetEmployeeId : null;
        const created = await tx.expense.create({
          data: {
            expenseNumber,
            businessDate: shift.businessDate,
            categoryId: e.categoryId,
            shiftId: shift.id,
            paidByUserId: e.paidByUserId ?? shift.userId,
            salaryTargetEmployeeId: targetEmployeeId,
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

        if (isSalaryRow && ownerAutoApprove && created.salaryTargetEmployeeId) {
          await applySalaryExpense(tx, {
            expenseId: created.id,
            employeeId: created.salaryTargetEmployeeId,
            amount: created.amount,
            paymentMethod: created.paymentMethod,
            businessDate: created.businessDate,
            recordedBy: input.actor.id,
            notes: created.notes,
          });
        }

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

      // No handover is created by this endpoint. The waiter kiosk path
      // records its handover via POST /handovers; a manager/owner
      // operating the shift directly is already holding the cash.
      const handover = null;

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
      handover: null,
      created: {
        collections: newCollectionRows.length,
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

export async function closeMoney(input: {
  actor: { id: string; role: Role };
  shiftId: string;
  collections: CollectionInput;
  expenses?: ExpenseInput[];
  cashHandedOver: string;
  receivedByUserId?: string;
  notes?: string | null;
}) {
  return runShiftClose(input, 'close-money');
}

export async function completeShift(input: {
  actor: { id: string; role: Role };
  shiftId: string;
  expenses?: ExpenseInput[];
  cashHandedOver: string;
  receivedByUserId?: string;
  notes?: string | null;
}) {
  return runShiftClose({ ...input, collections: undefined }, 'complete-shift');
}

export async function submitShift(input: {
  actor: { id: string; role: Role };
  shiftId: string;
  collections?: CollectionInput;
  expenses?: ExpenseInput[];
  cashHandedOver: string;
  receivedByUserId?: string;
  notes?: string | null;
}) {
  return runShiftClose(input, 'submit');
}

export async function finalizeShift(input: {
  actor: { id: string; role: Role };
  shiftId: string;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can finalize a shift.');
  }

  const shift = await prisma.shift.findUnique({
    where: { id: input.shiftId },
    include: {
      reconciliation: true,
      cashHandovers: {
        where: { voidedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!shift) throw new ApiError(404, 'SHIFT_NOT_FOUND', 'Shift not found.');
  if (shift.status === 'CLOSED') {
    throw new ApiError(409, 'SHIFT_ALREADY_CLOSED', 'Shift is already closed.');
  }
  if (shift.status === 'OPEN') {
    throw new ApiError(
      409,
      'SHIFT_NOT_SUBMITTED',
      'Shift has not been submitted yet.'
    );
  }

  await assertDayNotClosed(shift.businessDate, input.actor.role);

  const recon = shift.reconciliation;
  const handover = shift.cashHandovers[0] ?? null;

  // Self-review guard: a MANAGER cannot review their own submission.
  if (
    input.actor.role === 'MANAGER' &&
    recon &&
    recon.status === 'SUBMITTED' &&
    recon.createdBy === input.actor.id
  ) {
    throw new ApiError(
      403,
      'SELF_REVIEW_FORBIDDEN',
      'A manager cannot review their own submission. Ask an owner to review.'
    );
  }

  const now = new Date();
  let reviewPerformed = false;
  let handoverConfirmed = false;

  await prisma.$transaction(async (tx) => {
    if (recon && recon.status === 'SUBMITTED') {
      await tx.reconciliation.update({
        where: { id: recon.id },
        data: {
          status: 'REVIEWED',
          reviewedBy: input.actor.id,
          reviewedAt: now,
        },
      });
      reviewPerformed = true;
    }

    if (handover && handover.status === 'PENDING') {
      await tx.cashHandover.update({
        where: { id: handover.id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: now,
        },
      });
      handoverConfirmed = true;
    }

    const shiftData: Prisma.ShiftUpdateInput = {
      status: 'CLOSED',
      closedBy: input.actor.id,
      closedAt: now,
      endedAt: now,
    };
    if (shift.status === 'SUBMITTED') {
      shiftData.reviewedBy = input.actor.id;
      shiftData.reviewedAt = now;
    }
    await tx.shift.update({ where: { id: shift.id }, data: shiftData });
  });

  const updated = await prisma.shift.findUnique({ where: { id: shift.id } });
  return {
    shift: {
      id: updated!.id,
      status: updated!.status,
      closedAt: updated!.closedAt ? updated!.closedAt.toISOString() : null,
    },
    reviewPerformed,
    handoverConfirmed,
  };
}
