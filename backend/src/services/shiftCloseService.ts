import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import { assertDayNotClosed } from './closedDayGuard.js';
import { nextExpenseNumber } from '../utils/expenseNumber.js';
import { applySalaryExpense } from './salaryService.js';
import type { PaymentMethod, Role, Prisma } from '@prisma/client';

type MpesaEntryInput = {
  payerName: string;
  amount: string;
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

/**
 * Fetch the total sales for a waiter on a business date.
 *
 * Returns null when no SalesSummary exists, so the caller can fail the
 * close with a clear error rather than silently computing net cash
 * against a zero.
 *
 * If multiple SalesSummary rows exist for the same (userId, businessDate)
 * — e.g. one per POS source — their totalSales are summed.
 */
async function totalSalesForUserAndDate(
  userId: string,
  businessDate: Date
): Promise<Prisma.Decimal | null> {
  const rows = await prisma.salesSummary.findMany({
    where: { userId, businessDate },
    select: { totalSales: true },
  });
  if (rows.length === 0) return null;
  let sum = toDecimal('0');
  for (const r of rows) sum = sum.plus(r.totalSales);
  return sum;
}

async function runShiftClose(
  input: {
    actor: { id: string; role: Role };
    shiftId: string;
    mpesaEntries?: MpesaEntryInput[];
    expenses?: ExpenseInput[];
    cashHandedOver?: string; // legacy: only meaningful for 'complete-shift'
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

  // Existing non-voided collections. Only relevant for 'complete-shift',
  // which continues to work against already-recorded collections.
  const existingCollections = await prisma.collection.findMany({
    where: { shiftId: input.shiftId, voidedAt: null },
    select: { paymentMethod: true, amount: true },
  });

  // Opening-cash gate removed: auto-opened shifts have no opening cash
  // and this close flow no longer depends on one. Net cash is computed
  // from SalesSummary minus mobile and expenses.

  // complete-shift exists to close a shift that already has recorded
  // collections. If there are none, the caller should use close-money
  // instead — which handles the "no prior activity" path explicitly.
  if (mode === 'complete-shift' && existingCollections.length === 0) {
    throw new ApiError(
      400,
      'NO_COLLECTIONS',
      'This shift has no non-voided collections. Use close-money instead.'
    );
  }

  await assertDayNotClosed(shift.businessDate, input.actor.role);

  const expenseInputs = input.expenses ?? [];
  const mpesaEntries = input.mpesaEntries ?? [];

  if (mode === 'close-money' || mode === 'submit') {
    // SalesSummary is required for these modes.
    const salesTotal = await totalSalesForUserAndDate(shift.userId, shift.businessDate);
    if (salesTotal === null) {
      throw new ApiError(
        409,
        'NO_SALES_SUMMARY',
        'No sales summary exists for this waiter and business date. Record the day\'s sales before closing the shift.'
      );
    }
  }

  // Category validation (unchanged).
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

  // paidByUser validation (unchanged).
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

  // Owner preferences (unchanged).
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

  // ── Compute the numbers ────────────────────────────────────
  // For 'complete-shift', expected cash comes from recorded sales (or cash
  // collections when no summary exists) minus mobile money and cash
  // expenses; the supplied cashHandedOver is the ACTUAL counted amount.
  // For 'close-money' / 'submit', we compute from mpesa entries and
  // expenses, and cash is derived — no client override.

  let salesTotal = toDecimal('0');
  let totalMobileMoney = toDecimal('0');
  let totalExpenses = toDecimal('0');
  let cashExpenses = toDecimal('0');
  let expectedCash = toDecimal('0');
  let actualCash = toDecimal('0');
  let actualMobile = toDecimal('0');
  let mpesaRowsToCreate: MpesaEntryInput[] = [];

  if (mode === 'complete-shift') {
    // Legacy path: existing collections + supplied cash count.
    let existingCash = toDecimal('0');
    let existingMobile = toDecimal('0');
    for (const c of existingCollections) {
      if (c.paymentMethod === 'CASH') existingCash = existingCash.plus(c.amount);
      else if (c.paymentMethod === 'MPESA' || c.paymentMethod === 'AIRTEL_MONEY'
        || c.paymentMethod === 'TIGO_PESA' || c.paymentMethod === 'HALOPESA') {
        existingMobile = existingMobile.plus(c.amount);
      }
    }
    for (const e of expenseInputs) {
      const amount = toDecimal(e.amount);
      totalExpenses = totalExpenses.plus(amount);
      if (e.paymentMethod === 'CASH') cashExpenses = cashExpenses.plus(amount);
    }

    // Expected drawer cash comes from recorded sales when a summary
    // exists, otherwise from recorded cash collections. The counted cash
    // supplied by the caller is the ACTUAL figure, never the expectation.
    const sales = await totalSalesForUserAndDate(shift.userId, shift.businessDate);
    salesTotal = sales ?? toDecimal('0');
    expectedCash = sales !== null
      ? sales.minus(existingMobile).minus(cashExpenses)
      : existingCash.minus(cashExpenses);
    actualCash = toDecimal(input.cashHandedOver ?? '0');
    if (actualCash.isNegative()) {
      throw new ApiError(400, 'INVALID_CASH_COUNT', 'Counted cash cannot be negative.');
    }
    totalMobileMoney = existingMobile;
    actualMobile = existingMobile;
  } else {
    const fetchedSales = await totalSalesForUserAndDate(shift.userId, shift.businessDate);
    // Guarded above, but re-check for type safety.
    if (fetchedSales === null) {
      throw new ApiError(409, 'NO_SALES_SUMMARY', 'No sales summary exists for this shift.');
    }
    salesTotal = fetchedSales;

    for (const m of mpesaEntries) totalMobileMoney = totalMobileMoney.plus(toDecimal(m.amount));
    for (const e of expenseInputs) {
      const amount = toDecimal(e.amount);
      totalExpenses = totalExpenses.plus(amount);
      if (e.paymentMethod === 'CASH') cashExpenses = cashExpenses.plus(amount);
    }

    // Only cash expenses leave the drawer. Mobile/bank expenses are
    // already accounted for by their payment channel.
    expectedCash = salesTotal.minus(totalMobileMoney).minus(cashExpenses);
    actualCash = expectedCash;
    actualMobile = totalMobileMoney;

    mpesaRowsToCreate = mpesaEntries;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();

      // Create mpesa collection rows (one per payer entry).
      for (const m of mpesaRowsToCreate) {
        await tx.collection.create({
          data: {
            shiftId: shift.id,
            userId: shift.userId,
            createdById: input.actor.id,
            paymentMethod: 'MPESA',
            amount: toDecimal(m.amount),
            mobileReference: m.payerName,
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
            source: 'PAYROLL',
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
          expectedMobile: totalMobileMoney,
          actualCash,
          actualMobile,
          cashDifference: actualCash.minus(expectedCash),
          mobileDifference: actualMobile.minus(totalMobileMoney),
          status: ownerAutoReview ? 'REVIEWED' : 'SUBMITTED',
          notes: input.notes ?? null,
          submittedAt: now,
          reviewedBy: ownerAutoReview ? input.actor.id : null,
          reviewedAt: ownerAutoReview ? now : null,
        },
      });

      await tx.shift.update({
        where: { id: shift.id },
        data: { status: 'SUBMITTED', submittedAt: now },
      });

      return { recon, expenseCount };
    });

    return {
      reconciliation: {
        id: result.recon.id,
        shiftId: result.recon.shiftId,
        expectedCash: toMoneyString(expectedCash),
        expectedMobile: toMoneyString(totalMobileMoney),
        actualCash: toMoneyString(actualCash),
        actualMobile: toMoneyString(actualMobile),
        cashDifference: toMoneyString(actualCash.minus(expectedCash)),
        mobileDifference: toMoneyString(actualMobile.minus(totalMobileMoney)),
        status: result.recon.status,
      },
      // Computed summary for the client to display.
      summary: {
        totalSales: toMoneyString(salesTotal),
        totalMobileMoney: toMoneyString(totalMobileMoney),
        totalExpenses: toMoneyString(totalExpenses),
        cashExpenses: toMoneyString(cashExpenses),
        netCash: toMoneyString(expectedCash),
      },
      handover: null,
      created: {
        mpesaEntries: mpesaRowsToCreate.length,
        expenses: result.expenseCount,
      },
    };
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Could be the shift-reconciliation unique OR a duplicate
      // mobileReference within this shift. Both are 409s.
      throw new ApiError(
        409,
        'DUPLICATE_REFERENCE',
        'A reconciliation already exists for this shift, or a mobile-money reference was declared twice in the same shift.'
      );
    }
    throw err;
  }
}

export async function closeMoney(input: {
  actor: { id: string; role: Role };
  shiftId: string;
  mpesaEntries?: MpesaEntryInput[];
  expenses?: ExpenseInput[];
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
  return runShiftClose({ ...input, mpesaEntries: undefined }, 'complete-shift');
}

export async function submitShift(input: {
  actor: { id: string; role: Role };
  shiftId: string;
  mpesaEntries?: MpesaEntryInput[];
  expenses?: ExpenseInput[];
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
    throw new ApiError(409, 'SHIFT_NOT_SUBMITTED', 'Shift has not been submitted yet.');
  }

  await assertDayNotClosed(shift.businessDate, input.actor.role);

  const recon = shift.reconciliation;
  const handover = shift.cashHandovers[0] ?? null;

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
        data: { status: 'REVIEWED', reviewedBy: input.actor.id, reviewedAt: now },
      });
      reviewPerformed = true;
    }

    if (handover && handover.status === 'PENDING') {
      await tx.cashHandover.update({
        where: { id: handover.id },
        data: { status: 'CONFIRMED', confirmedAt: now },
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

/**
 * System-initiated closure of a stale OPEN shift.
 *
 * Called by the auto-close scheduler and by the per-user login backstop
 * when a user has an OPEN shift from a prior business date. This does
 * NOT create a reconciliation or fabricate a cash figure — the shift
 * is marked CLOSED with autoClosedAt set so downstream consumers know
 * it requires manager review before it can be considered accounted for.
 *
 * Idempotent: if the shift is already CLOSED, returns silently. If the
 * shift is SUBMITTED or RECONCILING, refuses (those need human review).
 */
export async function autoCloseStaleOpenShift(
  shiftId: string
): Promise<{ id: string; businessDate: Date } | null> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: { id: true, businessDate: true, status: true },
  });
  if (!shift) return null;
  if (shift.status === 'CLOSED') return { id: shift.id, businessDate: shift.businessDate };
  if (shift.status !== 'OPEN') {
    throw new ApiError(
      409,
      'SHIFT_NOT_AUTO_CLOSABLE',
      'Shift is ' + shift.status + ' and must be handled through the normal reconciliation flow.'
    );
  }

  const now = new Date();
  await prisma.shift.update({
    where: { id: shift.id },
    data: {
      status: 'CLOSED',
      autoClosedAt: now,
      closedAt: now,
      endedAt: now,
    },
  });

  return { id: shift.id, businessDate: shift.businessDate };
}