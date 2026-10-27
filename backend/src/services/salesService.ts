import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import { parseBusinessDate, toDateOnly } from '../utils/businessDate.js';
import { parseSalesCsv } from './posImporter.js';
import { assertDayNotClosed } from './closedDayGuard.js';
import type { ExpenseOrigin, PaymentMethod, Prisma, Role } from '@prisma/client';
import { ensureOpenShiftForUserAndDate } from './shiftService.js';
import { buildSubmissionFingerprint, markSubmissionPending } from './dailyCashReceiptService.js';
import { nextExpenseNumber } from '../utils/expenseNumber.js';
import { applySalaryExpense, reverseKioskSalaryExpense } from './salaryService.js';

const MOBILE_METHODS: ReadonlySet<PaymentMethod> = new Set([
  'MPESA',
  'AIRTEL_MONEY',
  'TIGO_PESA',
  'HALOPESA',
]);

function classify(pm: PaymentMethod): 'cash' | 'mobile' | 'other' {
  if (pm === 'CASH') return 'cash';
  if (MOBILE_METHODS.has(pm)) return 'mobile';
  return 'other';
}

interface LineInput {
  paymentMethod: PaymentMethod;
  amount: Prisma.Decimal;
  notes?: string | null;
}

function summarize(lines: LineInput[]): {
  total: Prisma.Decimal;
  cash: Prisma.Decimal;
  mobile: Prisma.Decimal;
  other: Prisma.Decimal;
} {
  let cash = toDecimal('0');
  let mobile = toDecimal('0');
  let other = toDecimal('0');
  for (const l of lines) {
    const kind = classify(l.paymentMethod);
    if (kind === 'cash') cash = cash.plus(l.amount);
    else if (kind === 'mobile') mobile = mobile.plus(l.amount);
    else other = other.plus(l.amount);
  }
  const total = cash.plus(mobile).plus(other);
  return { total, cash, mobile, other };
}

function serializeSummary(s: {
  id: string;
  businessDate: Date;
  source: 'EXISTING_POS' | 'MANUAL' | 'IMPORT' | 'FUTURE_API';
  sourceReference: string;
  totalSales: Prisma.Decimal;
  cashSales: Prisma.Decimal;
  mobileSales: Prisma.Decimal;
  otherSales: Prisma.Decimal;
  userId: string | null;
  enteredBy: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  lines: Array<{
    id: string;
    paymentMethod: PaymentMethod;
    amount: Prisma.Decimal;
    notes: string | null;
  }>;
}) {
  return {
    id: s.id,
    businessDate: toDateOnly(s.businessDate),
    source: s.source,
    sourceReference: s.sourceReference,
    userId: s.userId,
    totalSales: toMoneyString(s.totalSales),
    cashSales: toMoneyString(s.cashSales),
    mobileSales: toMoneyString(s.mobileSales),
    otherSales: toMoneyString(s.otherSales),
    enteredBy: s.enteredBy,
    verifiedBy: s.verifiedBy,
    verifiedAt: s.verifiedAt ? s.verifiedAt.toISOString() : null,
    notes: s.notes,
    lines: s.lines.map((l) => ({
      id: l.id,
      paymentMethod: l.paymentMethod,
      amount: toMoneyString(l.amount),
      notes: l.notes,
    })),
    createdAt: s.createdAt.toISOString(),
  };
}

const INCLUDE_LINES = { lines: true } as const;

export async function listSummaries(opts: {
  businessDate?: string;
  source?: 'EXISTING_POS' | 'MANUAL' | 'IMPORT' | 'FUTURE_API';
  userId?: string;
}) {
  const where: Prisma.SalesSummaryWhereInput = {};
  if (opts.businessDate) where.businessDate = parseBusinessDate(opts.businessDate);
  if (opts.source) where.source = opts.source;
  if (opts.userId) where.userId = opts.userId;

  const rows = await prisma.salesSummary.findMany({
    where,
    include: INCLUDE_LINES,
    orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });
  return rows.map(serializeSummary);
}

/**
 * Look up an existing MANUAL summary for a specific waiter + date, used by
 * the controller as a duplicate guard before permitting a create. Returns
 * null when userId is missing (unattributed summaries do not collide).
 */
export async function findExistingManualSummary(opts: {
  businessDate: string;
  userId: string | null;
  sourceReference: string;
}) {
  if (!opts.userId) return null;
  return prisma.salesSummary.findFirst({
    where: {
      source: 'MANUAL',
      businessDate: parseBusinessDate(opts.businessDate),
      sourceReference: opts.sourceReference,
      userId: opts.userId,
    },
    select: { id: true, totalSales: true, createdAt: true },
  });
}

export async function getSummaryById(id: string) {
  const row = await prisma.salesSummary.findUnique({
    where: { id },
    include: INCLUDE_LINES,
  });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Sales summary not found.');
  return serializeSummary(row);
}

/**
 * Fetch the single summary the manager/cashier entered for this waiter on
 * this business date, plus their currently-active DAILY expenses. Returns
 * null when nothing has been entered yet — the kiosk shows a "come back
 * later" notice in that case, no form.
 *
 * "Individual" semantics: one waiter = one summary per day. If somehow
 * more than one exists (data drift), we take the most recent.
 */
export async function listMySummary(userId: string, businessDate: string) {
  const bd = parseBusinessDate(businessDate);
  const summary = await prisma.salesSummary.findFirst({
    where: { userId, businessDate: bd },
    include: INCLUDE_LINES,
    orderBy: { createdAt: 'desc' },
  });
  if (!summary) return null;

  // Return all active kiosk expenses for this waiter/day, regardless of
  // category. Attribution is by paidByUserId so a manager submitting on
  // the waiter's behalf still surfaces the rows on the waiter's kiosk.
  const activeExpenses = await prisma.expense.findMany({
    where: {
      businessDate: bd,
      voidedAt: null,
      origin: 'KIOSK',
      OR: [
        { paidByUserId: userId },
        { paidByUserId: null, createdBy: userId },
      ],
    },
    select: {
      id: true,
      description: true,
      amount: true,
      categoryId: true,
      salaryTargetEmployeeId: true,
      category: { select: { id: true, name: true, systemKey: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // The waiter's own active M-Pesa collections for the day. These live
  // in Collection, not SalesSummary.lines — submitWaiterCollections
  // writes them there. Filter by the assigned waiter's userId, not
  // createdById, so a manager who submits on the waiter's behalf still
  // surfaces the rows on the waiter's kiosk.
  const activeMpesa = await prisma.collection.findMany({
    where: {
      userId,
      paymentMethod: 'MPESA',
      voidedAt: null,
      shift: { businessDate: bd },
    },
    select: {
      id: true,
      mobileReference: true,
      amount: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return {
    summary: serializeSummary(summary),
    activeExpenses: activeExpenses.map((e) => ({
      id: e.id,
      description: e.description,
      amount: toMoneyString(e.amount),
      categoryId: e.categoryId,
      salaryTargetEmployeeId: e.salaryTargetEmployeeId,
      categoryName: e.category.name,
      categorySystemKey: e.category.systemKey,
    })),
    mpesaEntries: activeMpesa.map((c) => ({
      id: c.id,
      payerName: c.mobileReference ?? '',
      amount: toMoneyString(c.amount),
    })),
  };
}

/**
 * Waiter (or a manager on a waiter's behalf) submits the day's actual money
 * movements: M-Pesa collections keyed by payer name, and expenses.
 *
 * This is the correct shape for the daily-close flow. It writes to
 * `Collection` (money received) and `Expense` (money spent), and it does
 * NOT touch any `SalesSummary` field. The declared sales figures the
 * manager entered on /ops/sales remain the independent comparison side of
 * the closing's `mobileSalesDiscrepancy` calculation.
 *
 * Supersession is actor-scoped. On a resubmission by the same actor, their
 * own previous active M-Pesa collections on this shift are voided and
 * replaced. Collections created by a *different* actor on the same shift
 * with the same payer name cause an explicit 409 — never a silent
 * overwrite — because two creators may represent two different real
 * payments and we cannot tell them apart from a name alone.
 *
 * Concurrency: the partial unique index
 *   ("shiftId", "paymentMethod", "mobileReference") WHERE mobileReference IS NOT NULL
 * is the final guard. The pre-flight query inside the transaction makes
 * the cross-actor conflict explicit and returns a distinguishable error;
 * the index catches races the pre-flight can't see and maps to
 * DUPLICATE_MOBILE_REFERENCE.
 *
 * Known limitation (documented in validators/shiftClose.ts): two distinct
 * payers with the same name on the same shift cannot coexist when the
 * payer name is used as the mobile reference. Operators must disambiguate
 * at entry time. No auto-suffixing. No schema change in this change.
 */
export async function submitWaiterCollections(input: {
  summaryId: string;
  actorId: string;
  actorRole: Role;
  mpesaEntries: Array<{ payerName: string; amount: string }>;
  expenses: Array<{
    categoryId: string;
    description: string;
    amount: string;
    salaryTargetEmployeeId?: string;
  }>;
}) {
  const summary = await prisma.salesSummary.findUnique({
    where: { id: input.summaryId },
  });
  if (!summary) throw new ApiError(404, 'NOT_FOUND', 'Sales summary not found.');
  if (!summary.userId) {
    throw new ApiError(
      409,
      'NO_ASSIGNED_WAITER',
      'This summary has no assigned waiter.'
    );
  }
  if (input.actorRole === 'WAITER' && summary.userId !== input.actorId) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'You can only submit your own daily collections.'
    );
  }

  // Capture the narrowed userId once. TypeScript cannot carry the
  // null-narrowing across a closure boundary, and Collection.userId is
  // non-nullable. Prefer a local const over a non-null assertion so the
  // invariant is enforced at the type level where the value is used.
  const attributedUserId: string = summary.userId;

  await assertDayNotClosed(summary.businessDate, input.actorRole);

  // Ensure the shift exists before opening the transaction. Idempotent;
  // outside the tx so a race on shift creation isn't inside our write path.
  const shift = await ensureOpenShiftForUserAndDate(
    attributedUserId,
    summary.businessDate
  );

  const entries = input.mpesaEntries.map((m) => ({
    payerName: m.payerName.trim(),
    amount: toDecimal(m.amount),
  }));

  try {
    const result = await prisma.$transaction(async (tx) => {
      // ---- 1. Pre-flight cross-actor conflict check (no writes yet) -----
      //  For every payer name in the incoming set, look for an active
      //  Collection on this shift with the same (paymentMethod, mobileReference).
      //  - row created by this actor          -> we will void + replace below
      //  - row created by a different actor   -> 409, roll back entire submission
      if (entries.length > 0) {
        const incomingNames = entries.map((e) => e.payerName);
        const existing = await tx.collection.findMany({
          where: {
            shiftId: shift.id,
            paymentMethod: 'MPESA',
            mobileReference: { in: incomingNames },
            voidedAt: null,
          },
          select: { id: true, mobileReference: true, createdById: true },
        });
        const foreign = existing.find((c) => c.createdById !== input.actorId);
        if (foreign) {
          throw new ApiError(
            409,
            'CONFLICT_WITH_OTHER_ACTOR',
            `A collection for payer "${foreign.mobileReference}" on this shift was recorded by another user. Resolve it before resubmitting.`,
            {
              conflict: {
                collectionId: foreign.id,
                payerName: foreign.mobileReference,
                createdById: foreign.createdById,
              },
            }
          );
        }
      }

      // ---- 2. Void this actor's own prior active M-Pesa collections -----
      await tx.collection.updateMany({
        where: {
          shiftId: shift.id,
          paymentMethod: 'MPESA',
          createdById: input.actorId,
          voidedAt: null,
        },
        data: {
          voidedAt: new Date(),
          voidedBy: input.actorId,
          voidReason: 'Superseded by resubmission',
        },
      });

      // ---- 3. Create the new collections --------------------------------
      //  Any P2002 here is caught by the outer try and mapped to
      //  DUPLICATE_MOBILE_REFERENCE. The transaction rolls back fully.
      const createdCollections: Array<{
        id: string;
        paymentMethod: PaymentMethod;
        amount: string;
        mobileReference: string | null;
        createdAt: string;
      }> = [];
      for (const e of entries) {
        const row = await tx.collection.create({
          data: {
            shiftId: shift.id,
            userId: attributedUserId,
            createdById: input.actorId,
            paymentMethod: 'MPESA',
            amount: e.amount,
            mobileReference: e.payerName,
            notes: null,
          },
        });
        createdCollections.push({
          id: row.id,
          paymentMethod: row.paymentMethod,
          amount: toMoneyString(row.amount),
          mobileReference: row.mobileReference,
          createdAt: row.createdAt.toISOString(),
        });
      }

      // ---- 4. Expenses (reuse the existing helper, same tx) -------------
      await handleDailyExpenses(tx, {
        businessDate: summary.businessDate,
        userId: attributedUserId,
        enteredBy: input.actorId,
        origin: 'KIOSK',
        expenseRows: input.expenses.map((e) => ({
          categoryId: e.categoryId,
          description: e.description,
          amount: toDecimal(e.amount),
          salaryTargetEmployeeId: e.salaryTargetEmployeeId,
        })),
      });

      // ---- 5. Re-read committed state for the response ------------------
      const finalSummary = await tx.salesSummary.findUniqueOrThrow({
        where: { id: summary.id },
        include: INCLUDE_LINES,
      });

      // Return every active kiosk expense for this waiter/day, regardless
      // of category, so the kiosk can render the previous submission in
      // full before the waiter replaces it. Attribution is by
      // paidByUserId so manager-on-behalf entries are included.
      const activeExpenses = await tx.expense.findMany({
        where: {
          businessDate: summary.businessDate,
          voidedAt: null,
          origin: 'KIOSK',
          OR: [
            { paidByUserId: attributedUserId },
            { paidByUserId: null, createdBy: input.actorId },
          ],
        },
        select: {
          id: true,
          expenseNumber: true,
          amount: true,
          description: true,
          paymentMethod: true,
          categoryId: true,
          salaryTargetEmployeeId: true,
          category: { select: { id: true, name: true, systemKey: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      const fingerprint = buildSubmissionFingerprint({
        mpesaEntries: input.mpesaEntries,
        expenses: input.expenses,
      });
      await markSubmissionPending(tx, {
        userId: attributedUserId,
        businessDate: summary.businessDate,
        actorId: input.actorId,
        fingerprint,
      });

      return {
        summary: serializeSummary(finalSummary),
        collections: createdCollections,
        expenses: activeExpenses.map((e) => ({
          id: e.id,
          expenseNumber: e.expenseNumber,
          amount: toMoneyString(e.amount),
          description: e.description,
          paymentMethod: e.paymentMethod,
          categoryId: e.categoryId,
          salaryTargetEmployeeId: e.salaryTargetEmployeeId,
          categoryName: e.category.name,
          categorySystemKey: e.category.systemKey,
        })),
      };
    });

    return result;
  } catch (err) {
    // Race / unexpected collision on the partial unique index. Translate
    // to a clean 409 so the caller never sees a raw Prisma error and
    // nothing is left partially committed (the tx already rolled back).
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      throw new ApiError(
        409,
        'DUPLICATE_MOBILE_REFERENCE',
        'A mobile reference in this submission already exists on this shift.'
      );
    }
    throw err;
  }
}
/**
 * Waiter submits the M-Pesa breakdown and expenses for a summary that was
 * already created upstream. Replaces the summary's MPESA lines (keeping
 * any CASH/other lines the manager entered) and recomputes mobileSales.
 * Supersedes the waiter's prior DAILY expenses, creates the new rows.
 *
 * Total Sales is untouched — the manager/cashier entered it and the waiter
 * cannot overwrite it.
 */
export async function submitWaiterReport(input: {
  summaryId: string;
  actorId: string;
  actorRole: Role;
  mpesaRows: Array<{ name: string; amount: string }>;
  expenseRows: Array<{ description: string; amount: string }>;
}) {
  const summary = await prisma.salesSummary.findUnique({
    where: { id: input.summaryId },
  });
  if (!summary) throw new ApiError(404, 'NOT_FOUND', 'Sales summary not found.');
  if (!summary.userId) {
    throw new ApiError(
      409,
      'NO_ASSIGNED_WAITER',
      'This summary has no assigned waiter.'
    );
  }
  if (input.actorRole === 'WAITER' && summary.userId !== input.actorId) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'You can only submit your own daily report.'
    );
  }

  await assertDayNotClosed(summary.businessDate, input.actorRole);
  await ensureOpenShiftForUserAndDate(summary.userId, summary.businessDate);

  const mpesaLines = input.mpesaRows.map((r) => ({
    paymentMethod: 'MPESA' as const,
    amount: toDecimal(r.amount),
    notes: r.name,
  }));

  const newMobile = mpesaLines.reduce(
    (sum, l) => sum.plus(l.amount),
    toDecimal('0')
  );
  // Total stays; cash is whatever's left after the new mobile + other.
  const newCash = summary.totalSales.minus(newMobile).minus(summary.otherSales);
  if (newCash.isNegative()) {
    throw new ApiError(
      400,
      'NEGATIVE_CASH',
      'M-Pesa and other sales exceed the recorded total sales; cash cannot be negative.'
    );
  }

  return prisma.$transaction(async (tx) => {
    // Replace only the MPESA lines. Manager-entered CASH/other lines stay.
    await tx.salesSummaryLine.deleteMany({
      where: { salesSummaryId: summary.id, paymentMethod: 'MPESA' },
    });
    if (mpesaLines.length > 0) {
      await tx.salesSummaryLine.createMany({
        data: mpesaLines.map((l) => ({
          salesSummaryId: summary.id,
          paymentMethod: l.paymentMethod,
          amount: l.amount,
          notes: l.notes,
        })),
      });
    }
    await tx.salesSummary.update({
      where: { id: summary.id },
      data: { mobileSales: newMobile, cashSales: newCash },
    });

    await handleDailyExpenses(tx, {
      businessDate: summary.businessDate,
      userId: summary.userId,
      enteredBy: input.actorId,
      origin: 'KIOSK',
      expenseRows: input.expenseRows.map((r) => ({
        description: r.description,
        amount: toDecimal(r.amount),
      })),
    });

    const updated = await tx.salesSummary.findUniqueOrThrow({
      where: { id: summary.id },
      include: INCLUDE_LINES,
    });
    return serializeSummary(updated);
  });
}

async function ensureActiveShift(businessDate: Date, userId: string | null) {
  if (!userId) return; // system/imported sales without an owner — no shift
  await ensureOpenShiftForUserAndDate(userId, businessDate);
}

/**
 * Supersede this actor's prior expenses for the same date and entry
 * channel, then create the new rows. Called inside the summary
 * transaction so a failure cannot leave a partially updated report.
 *
 * Scope rules:
 *   - only expenses with the same origin (KIOSK vs MANUAL)
 *   - only this actor's expenses on this business date
 *   - only currently-APPROVED, non-voided rows
 * Kiosk resubmission also reverses linked SalaryPayment/SalaryAdvance
 * rows so payroll is not paid twice. Cross-channel rows are untouched.
 *
 * Semantics for opts.expenseRows:
 *   undefined  → do nothing (legacy callers / CSV import)
 *   []         → supersede prior, create nothing
 *   [...]      → supersede prior, create these rows
 */
async function handleDailyExpenses(
  tx: Prisma.TransactionClient,
  opts: {
    businessDate: Date;
    userId: string | null;
    enteredBy: string;
    origin: ExpenseOrigin;
    expenseRows?: Array<{
      categoryId?: string;
      description: string;
      amount: Prisma.Decimal;
      salaryTargetEmployeeId?: string;
    }>;
  }
): Promise<void> {
  if (opts.expenseRows === undefined) return;
  if (!opts.userId) {
    // Daily report is always attributed to a user; ignore if there's none.
    return;
  }

  const rows = opts.expenseRows;

  for (const row of rows) {
    if (row.amount.lessThanOrEqualTo(0)) {
      throw new ApiError(400, 'INVALID_AMOUNT', 'Expense amounts must be greater than zero.');
    }
  }

  // DAILY is the fallback for legacy callers (upsertSummary, submitWaiterReport)
  // that still submit { description, amount } without a category.
  const dailyCat = await tx.expenseCategory.findUnique({
    where: { systemKey: 'DAILY' },
    select: { id: true },
  });
  if (!dailyCat) {
    throw new ApiError(
      500,
      'MISSING_DAILY_CATEGORY',
      'Daily expense category is not configured. Run prisma:apply-raw-sql.'
    );
  }

  // Any explicit categoryId must exist and be active. Track systemKey
  // so we can branch on SALARY rows.
  const explicitIds = Array.from(
    new Set(rows.map((r) => r.categoryId).filter((v): v is string => !!v))
  );
  const byId = new Map<string, { id: string; isActive: boolean; systemKey: string | null }>();
  if (explicitIds.length > 0) {
    const cats = await tx.expenseCategory.findMany({
      where: { id: { in: explicitIds } },
      select: { id: true, isActive: true, systemKey: true },
    });
    for (const c of cats) byId.set(c.id, c);
    for (const id of explicitIds) {
      const c = byId.get(id);
      if (!c) {
        throw new ApiError(400, 'INVALID_CATEGORY', 'Expense category ' + id + ' does not exist.');
      }
      if (!c.isActive) {
        throw new ApiError(400, 'CATEGORY_INACTIVE', 'Expense category ' + id + ' is not active.');
      }
    }
  }

  // Pre-validate SALARY rows and load target employees before any writes.
  // A single invalid row aborts the whole transaction, so no partial state.
  let kioskAttributedRole: Role | null | undefined;
  for (const row of rows) {
    const cat = row.categoryId ? byId.get(row.categoryId) : undefined;
    const isSalary = cat?.systemKey === 'SALARY';
    if (!isSalary) continue;
    if (!row.salaryTargetEmployeeId) {
      throw new ApiError(
        400,
        'EMPLOYEE_REQUIRED',
        'A salary expense must specify salaryTargetEmployeeId.'
      );
    }
    const emp = await tx.employee.findUnique({
      where: { id: row.salaryTargetEmployeeId },
      select: { id: true, isActive: true, userId: true },
    });
    if (!emp) {
      throw new ApiError(400, 'INVALID_EMPLOYEE', 'Employee ' + row.salaryTargetEmployeeId + ' does not exist.');
    }
    if (!emp.isActive) {
      throw new ApiError(409, 'EMPLOYEE_INACTIVE', 'Employee ' + emp.id + ' is not active.');
    }
    // Kiosk entries may only pay the salary of the waiter the kiosk session
    // is attributed to. Cross-employee payroll stays in the ops payroll flow.
    if (opts.origin === 'KIOSK') {
      if (kioskAttributedRole === undefined) {
        const attributedUser = await tx.user.findUnique({
          where: { id: opts.userId },
          select: { role: true },
        });
        kioskAttributedRole = attributedUser?.role ?? null;
      }
      if (kioskAttributedRole !== 'WAITER') {
        throw new ApiError(
          403,
          'KIOSK_SALARY_WAITER_ONLY',
          'Kiosk salary entries are only available on a waiter kiosk report.'
        );
      }
      if (emp.userId !== opts.userId) {
        throw new ApiError(
          403,
          'SALARY_TARGET_FORBIDDEN',
          'Kiosk salary entries can only pay the salary linked to the assigned waiter.'
        );
      }
    }
  }

  // Void prior non-voided rows for this business date and entry channel.
  // Kiosk rows are scoped to the attributed waiter, so a manager-on-behalf
  // submission and the waiter's own resubmission replace each other rather
  // than double-booking payroll. Manual ops expenses are actor-scoped.
  const previous = await tx.expense.findMany({
    where: {
      businessDate: opts.businessDate,
      origin: opts.origin,
      status: 'APPROVED',
      voidedAt: null,
      ...(opts.origin === 'KIOSK'
        ? {
            OR: [
              { paidByUserId: opts.userId },
              { paidByUserId: null, createdBy: opts.enteredBy },
            ],
          }
        : { createdBy: opts.enteredBy }),
    },
    select: { id: true },
  });

  if (previous.length > 0) {
    if (opts.origin === 'KIOSK') {
      // Undo the payroll effect first. This throws (and rolls back the whole
      // resubmission) if an advance was already settled, so a waiter can
      // never double-pay by resubmitting their daily report.
      for (const old of previous) {
        await reverseKioskSalaryExpense(tx, {
          expenseId: old.id,
          actorId: opts.enteredBy,
          reason: 'Superseded by daily report resubmission',
        });
      }
    }
    await tx.expense.updateMany({
      where: { id: { in: previous.map((e) => e.id) } },
      data: {
        status: 'VOID',
        voidedAt: new Date(),
        voidedBy: opts.enteredBy,
        voidReason: 'Superseded by daily report resubmission',
      },
    });
  }

  for (const row of rows) {
    const cat = row.categoryId ? byId.get(row.categoryId) : undefined;
    const isSalary = cat?.systemKey === 'SALARY';
    const expenseNumber = await nextExpenseNumber(tx);
    const created = await tx.expense.create({
      data: {
        expenseNumber,
        businessDate: opts.businessDate,
        categoryId: row.categoryId ?? dailyCat.id,
        shiftId: null,
        createdBy: opts.enteredBy,
        approvedBy: opts.enteredBy,
        approvedAt: new Date(),
        paidByUserId: opts.origin === 'KIOSK' ? opts.userId : null,
        origin: opts.origin,
        amount: row.amount,
        paymentMethod: 'CASH',
        description: row.description,
        status: 'APPROVED',
        salaryTargetEmployeeId: isSalary ? (row.salaryTargetEmployeeId ?? null) : null,
      },
    });

    // SALARY at the kiosk is a real payroll event. applySalaryExpense
    // pays down the employee's outstanding salary and records any
    // excess as a SalaryAdvance. If the employee has no APPROVED/PAID
    // SalaryRecord, it throws NO_SALARY_RECORD and the whole kiosk
    // submission rolls back — the money movement and the payroll
    // record either both land or neither does.
    if (isSalary && created.salaryTargetEmployeeId) {
      await applySalaryExpense(tx, {
        expenseId: created.id,
        employeeId: created.salaryTargetEmployeeId,
        amount: created.amount,
        paymentMethod: created.paymentMethod,
        businessDate: created.businessDate,
        recordedBy: opts.enteredBy,
        notes: created.notes ?? null,
        source: opts.origin === 'KIOSK' ? 'KIOSK' : 'PAYROLL',
      });
    }
  }
}

async function upsertSummary(opts: {
  businessDate: Date;
  source: 'EXISTING_POS' | 'MANUAL' | 'IMPORT' | 'FUTURE_API';
  sourceReference: string;
  userId: string | null;
  enteredBy: string;
  notes: string | null;
  lines: LineInput[];
  // When set, used as the summary's totalSales; cashSales is derived as
  // total - mobile - other. When undefined, totals are line-derived.
  totalSalesOverride?: Prisma.Decimal;
  // undefined  -> no expense handling (CSV import, legacy callers)
  // []         -> supersede prior DAILY expenses for this user/date
  // [...]      -> supersede prior and create these
  expenseRows?: Array<{ description: string; amount: Prisma.Decimal }>;
}): Promise<{ summary: ReturnType<typeof serializeSummary>; updated: boolean }> {
  await ensureActiveShift(opts.businessDate, opts.userId);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.salesSummary.findFirst({
      where: {
        source: opts.source,
        businessDate: opts.businessDate,
        sourceReference: opts.sourceReference,
        userId: opts.userId,
      },
      include: INCLUDE_LINES,
    });

    // Decide which lines will actually be in the DB after this call.
    //
    // Empty `lines` in the payload means "leave the existing lines alone".
    // The manager sales page uses this: it only sets the total, and must
    // not wipe the waiter's M-Pesa breakdown on a correction. CSV import
    // and manual entry always pass at least one line, so they keep the
    // original replace-everything behaviour.
    let liveLines: Array<{ paymentMethod: PaymentMethod; amount: Prisma.Decimal }>;

    if (existing) {
      if (opts.lines.length > 0) {
        await tx.salesSummaryLine.deleteMany({
          where: { salesSummaryId: existing.id },
        });
        await tx.salesSummaryLine.createMany({
          data: opts.lines.map((l) => ({
            salesSummaryId: existing.id,
            paymentMethod: l.paymentMethod,
            amount: l.amount,
            notes: l.notes ?? null,
          })),
        });
      }
      const dbLines = await tx.salesSummaryLine.findMany({
        where: { salesSummaryId: existing.id },
        select: { paymentMethod: true, amount: true },
      });
      liveLines = dbLines;
    } else {
      liveLines = opts.lines.map((l) => ({
        paymentMethod: l.paymentMethod,
        amount: l.amount,
      }));
    }

    const mobile = liveLines
      .filter((l) => l.paymentMethod === 'MPESA')
      .reduce((a, l) => a.plus(l.amount), toDecimal('0'));
    const cash = liveLines
      .filter((l) => l.paymentMethod === 'CASH')
      .reduce((a, l) => a.plus(l.amount), toDecimal('0'));
    const other = liveLines
      .filter((l) => l.paymentMethod !== 'MPESA' && l.paymentMethod !== 'CASH')
      .reduce((a, l) => a.plus(l.amount), toDecimal('0'));
    const lineSum = mobile.plus(cash).plus(other);

    const finalTotals = opts.totalSalesOverride
      ? {
          total: opts.totalSalesOverride,
          cash: opts.totalSalesOverride.minus(mobile).minus(other),
          mobile,
          other,
        }
      : {
          total: lineSum,
          cash,
          mobile,
          other,
        };

    if (finalTotals.cash.isNegative()) {
      throw new ApiError(
        400,
        'NEGATIVE_CASH',
        'Total sales must cover mobile and other sales; cash cannot be negative.'
      );
    }

    if (existing) {
      const updated = await tx.salesSummary.update({
        where: { id: existing.id },
        data: {
          totalSales: finalTotals.total,
          cashSales: finalTotals.cash,
          mobileSales: finalTotals.mobile,
          otherSales: finalTotals.other,
          enteredBy: opts.enteredBy,
          notes: opts.notes,
        },
        include: INCLUDE_LINES,
      });
      await handleDailyExpenses(tx, {
        businessDate: opts.businessDate,
        userId: opts.userId,
        enteredBy: opts.enteredBy,
        origin: 'MANUAL',
        expenseRows: opts.expenseRows,
      });
      return { summary: serializeSummary(updated), updated: true };
    }

    const created = await tx.salesSummary.create({
      data: {
        businessDate: opts.businessDate,
        source: opts.source,
        sourceReference: opts.sourceReference,
        userId: opts.userId,
        enteredBy: opts.enteredBy,
        notes: opts.notes,
        totalSales: finalTotals.total,
        cashSales: finalTotals.cash,
        mobileSales: finalTotals.mobile,
        otherSales: finalTotals.other,
        lines: {
          create: opts.lines.map((l) => ({
            paymentMethod: l.paymentMethod,
            amount: l.amount,
            notes: l.notes ?? null,
          })),
        },
      },
      include: INCLUDE_LINES,
    });
    await handleDailyExpenses(tx, {
      businessDate: opts.businessDate,
      userId: opts.userId,
      enteredBy: opts.enteredBy,
      origin: 'MANUAL',
      expenseRows: opts.expenseRows,
    });
    return { summary: serializeSummary(created), updated: false };
  });

  return result;
}

export async function createManualSummary(input: {
  businessDate: string;
  sourceReference: string;
  userId: string | null;
  notes: string | null;
  lines: Array<{ paymentMethod: PaymentMethod; amount: string; notes?: string | null }>;
  totalSales?: string;
  expenseRows?: Array<{ description: string; amount: string }>;
  enteredBy: string;
  actorRole: Role;
}) {
  const businessDate = parseBusinessDate(input.businessDate);
  await assertDayNotClosed(businessDate, input.actorRole);
  const { summary } = await upsertSummary({
    businessDate,
    source: 'MANUAL',
    sourceReference: input.sourceReference,
    userId: input.userId,
    enteredBy: input.enteredBy,
    notes: input.notes,
    lines: input.lines.map((l) => ({
      paymentMethod: l.paymentMethod,
      amount: toDecimal(l.amount),
      notes: l.notes ?? null,
    })),
    totalSalesOverride:
      input.totalSales !== undefined ? toDecimal(input.totalSales) : undefined,
    expenseRows:
      input.expenseRows !== undefined
        ? input.expenseRows.map((r) => ({
            description: r.description,
            amount: toDecimal(r.amount),
          }))
        : undefined,
  });
  return summary;
}

export async function importFromCsv(input: {
  csv: string;
  enteredBy: string;
  actorRole: Role;
}) {
  const parsed = parseSalesCsv(input.csv);

  let imported = 0;
  let updated = 0;
  const summaries: ReturnType<typeof serializeSummary>[] = [];

  for (const p of parsed) {
    const businessDate = parseBusinessDate(p.businessDate);
    await assertDayNotClosed(businessDate, input.actorRole);
    const result = await upsertSummary({
      businessDate,
      source: 'EXISTING_POS',
      sourceReference: p.sourceReference,
      userId: null,
      enteredBy: input.enteredBy,
      notes: p.notes,
      lines: p.lines.map((l) => ({
        paymentMethod: l.paymentMethod,
        amount: l.amount,
        notes: l.notes ?? null,
      })),
    });
    if (result.updated) updated += 1;
    else imported += 1;
    summaries.push(result.summary);
  }

  return { imported, updated, summaries };
}