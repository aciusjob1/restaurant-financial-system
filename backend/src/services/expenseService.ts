import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import { parseBusinessDate, toDateOnly } from '../utils/businessDate.js';
import { assertDayNotClosed } from './closedDayGuard.js';
import type { ExpenseStatus, PaymentMethod, Prisma, Role } from '@prisma/client';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}

function serialize(e: {
  id: string;
  expenseNumber: string;
  businessDate: Date;
  categoryId: string;
  shiftId: string | null;
  createdBy: string;
  approvedBy: string | null;
  paidByUserId: string | null;
  amount: Prisma.Decimal;
  paymentMethod: PaymentMethod;
  description: string;
  receiptNumber: string | null;
  attachmentPath: string | null;
  status: ExpenseStatus;
  notes: string | null;
  rejectedReason: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: e.id,
    expenseNumber: e.expenseNumber,
    businessDate: toDateOnly(e.businessDate),
    categoryId: e.categoryId,
    shiftId: e.shiftId,
    createdBy: e.createdBy,
    approvedBy: e.approvedBy,
    paidByUserId: e.paidByUserId,
    selfApproved: e.approvedBy !== null && e.createdBy === e.approvedBy,
    amount: toMoneyString(e.amount),
    paymentMethod: e.paymentMethod,
    description: e.description,
    receiptNumber: e.receiptNumber,
    attachmentPath: e.attachmentPath,
    status: e.status,
    notes: e.notes,
    rejectedReason: e.rejectedReason,
    submittedAt: e.submittedAt ? e.submittedAt.toISOString() : null,
    approvedAt: e.approvedAt ? e.approvedAt.toISOString() : null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

async function nextExpenseNumber(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRawUnsafe<Array<{ nextval: bigint }>>(
    "SELECT nextval('expense_number_seq') AS nextval"
  );
  const n = rows[0]?.nextval ?? 1n;
  return `EXP-${n.toString().padStart(4, '0')}`;
}

export async function listExpenses(opts: {
  businessDate?: string;
  from?: string;
  to?: string;
  categoryId?: string;
  status?: ExpenseStatus;
  paymentMethod?: PaymentMethod;
  createdBy?: string;
  includeRejected: boolean;
}) {
  const where: Prisma.ExpenseWhereInput = {};

  if (opts.businessDate) {
    where.businessDate = parseBusinessDate(opts.businessDate);
  } else if (opts.from || opts.to) {
    const range: Prisma.DateTimeFilter = {};
    if (opts.from) range.gte = parseBusinessDate(opts.from);
    if (opts.to) range.lte = parseBusinessDate(opts.to);
    where.businessDate = range;
  }

  if (opts.categoryId) where.categoryId = opts.categoryId;
  if (opts.paymentMethod) where.paymentMethod = opts.paymentMethod;
  if (opts.createdBy) where.createdBy = opts.createdBy;

  if (opts.status) {
    where.status = opts.status;
  } else if (!opts.includeRejected) {
    where.status = { not: 'REJECTED' };
  }

  const rows = await prisma.expense.findMany({
    where,
    orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });
  return rows.map(serialize);
}

export async function getExpenseById(id: string) {
  const row = await prisma.expense.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Expense not found.');
  return serialize(row);
}

export async function createExpense(input: {
  actor: { id: string; role: Role };
  businessDate: string;
  categoryId: string;
  shiftId?: string | null;
  paidByUserId?: string | null;
  amount: string;
  paymentMethod: PaymentMethod;
  description: string;
  receiptNumber?: string | null;
  attachmentPath?: string | null;
  notes?: string | null;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can create expenses.');
  }

  const businessDate = parseBusinessDate(input.businessDate);
  await assertDayNotClosed(businessDate, input.actor.role);

  const category = await prisma.expenseCategory.findUnique({
    where: { id: input.categoryId },
  });
  if (!category) throw new ApiError(400, 'INVALID_CATEGORY', 'Category does not exist.');
  if (!category.isActive) {
    throw new ApiError(400, 'CATEGORY_INACTIVE', 'Category is not active.');
  }

  if (input.shiftId) {
    const shift = await prisma.shift.findUnique({ where: { id: input.shiftId } });
    if (!shift) throw new ApiError(400, 'INVALID_SHIFT', 'Shift does not exist.');
  }

  if (input.paidByUserId) {
    const user = await prisma.user.findUnique({ where: { id: input.paidByUserId } });
    if (!user) throw new ApiError(400, 'INVALID_PAID_BY', 'Paid-by user does not exist.');
  }

  const row = await prisma.$transaction(async (tx) => {
    const expenseNumber = await nextExpenseNumber(tx);
    return tx.expense.create({
      data: {
        expenseNumber,
        businessDate,
        categoryId: input.categoryId,
        shiftId: input.shiftId ?? null,
        paidByUserId: input.paidByUserId ?? null,
        createdBy: input.actor.id,
        amount: toDecimal(input.amount),
        paymentMethod: input.paymentMethod,
        description: input.description,
        receiptNumber: input.receiptNumber ?? null,
        attachmentPath: input.attachmentPath ?? null,
        notes: input.notes ?? null,
      },
    });
  });

  return serialize(row);
}

export async function updateExpense(input: {
  id: string;
  actor: { id: string; role: Role };
  categoryId?: string;
  shiftId?: string | null;
  paidByUserId?: string | null;
  amount?: string;
  paymentMethod?: PaymentMethod;
  description?: string;
  receiptNumber?: string | null;
  attachmentPath?: string | null;
  notes?: string | null;
}) {
  const existing = await prisma.expense.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Expense not found.');

  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can edit expenses.');
  }

  if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
    throw new ApiError(
      409,
      'NOT_EDITABLE',
      `Expenses can only be edited in DRAFT or REJECTED (currently ${existing.status}).`
    );
  }

  await assertDayNotClosed(existing.businessDate, input.actor.role);

  if (input.categoryId !== undefined) {
    const cat = await prisma.expenseCategory.findUnique({ where: { id: input.categoryId } });
    if (!cat) throw new ApiError(400, 'INVALID_CATEGORY', 'Category does not exist.');
    if (!cat.isActive) throw new ApiError(400, 'CATEGORY_INACTIVE', 'Category is not active.');
  }

  if (input.paidByUserId) {
    const user = await prisma.user.findUnique({ where: { id: input.paidByUserId } });
    if (!user) throw new ApiError(400, 'INVALID_PAID_BY', 'Paid-by user does not exist.');
  }

  const row = await prisma.expense.update({
    where: { id: input.id },
    data: {
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.shiftId !== undefined ? { shiftId: input.shiftId } : {}),
      ...(input.paidByUserId !== undefined ? { paidByUserId: input.paidByUserId } : {}),
      ...(input.amount !== undefined ? { amount: toDecimal(input.amount) } : {}),
      ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.receiptNumber !== undefined ? { receiptNumber: input.receiptNumber } : {}),
      ...(input.attachmentPath !== undefined ? { attachmentPath: input.attachmentPath } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
  return serialize(row);
}

export async function submitExpense(input: {
  id: string;
  actor: { id: string; role: Role };
}) {
  const existing = await prisma.expense.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Expense not found.');

  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can submit expenses.');
  }

  if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
    throw new ApiError(
      409,
      'INVALID_TRANSITION',
      `Cannot submit an expense in status ${existing.status}.`
    );
  }

  await assertDayNotClosed(existing.businessDate, input.actor.role);

  const row = await prisma.expense.update({
    where: { id: input.id },
    data: {
      status: 'PENDING',
      submittedAt: new Date(),
      rejectedReason: null,
      approvedBy: null,
      approvedAt: null,
    },
  });
  return serialize(row);
}

export async function approveExpense(input: {
  id: string;
  actor: { id: string; role: Role };
}) {
  const existing = await prisma.expense.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Expense not found.');

  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can approve expenses.');
  }
  if (existing.status !== 'PENDING') {
    throw new ApiError(
      409,
      'INVALID_TRANSITION',
      `Only PENDING expenses can be approved (currently ${existing.status}).`
    );
  }
  if (existing.createdBy === input.actor.id && input.actor.role !== 'OWNER') {
    throw new ApiError(409, 'SELF_APPROVAL', 'You cannot approve your own expense.');
  }

  await assertDayNotClosed(existing.businessDate, input.actor.role);

  const row = await prisma.expense.update({
    where: { id: input.id },
    data: {
      status: 'APPROVED',
      approvedBy: input.actor.id,
      approvedAt: new Date(),
    },
  });
  return serialize(row);
}

export async function rejectExpense(input: {
  id: string;
  actor: { id: string; role: Role };
  reason: string;
}) {
  const existing = await prisma.expense.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Expense not found.');

  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can reject expenses.');
  }
  if (existing.status !== 'PENDING') {
    throw new ApiError(
      409,
      'INVALID_TRANSITION',
      `Only PENDING expenses can be rejected (currently ${existing.status}).`
    );
  }
  if (existing.createdBy === input.actor.id) {
    throw new ApiError(409, 'SELF_REJECTION', 'You cannot reject your own expense.');
  }

  await assertDayNotClosed(existing.businessDate, input.actor.role);

  const row = await prisma.expense.update({
    where: { id: input.id },
    data: {
      status: 'REJECTED',
      rejectedReason: input.reason,
      approvedBy: input.actor.id,
      approvedAt: new Date(),
    },
  });
  return serialize(row);
}

export { isUniqueViolation };