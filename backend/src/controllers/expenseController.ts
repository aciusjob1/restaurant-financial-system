import type { Request, Response } from 'express';
import * as expenseService from '../services/expenseService.js';
import * as categoryService from '../services/expenseCategoryService.js';
import { ApiError } from '../errors/ApiError.js';
import {
  ListExpensesQuerySchema,
  type CreateExpenseInput,
  type UpdateExpenseInput,
  type RejectExpenseInput,
  type CreateExpenseCategoryInput,
  type UpdateExpenseCategoryInput,
} from '../validators/expense.js';
import type { PaymentMethod } from '@prisma/client';

// ---------- Categories ----------

export async function listCategories(req: Request, res: Response) {
  const includeInactive = req.query.includeInactive === 'true';
  const categories = await categoryService.listCategories({ includeInactive });
  res.json({ success: true, categories });
}

export async function getCategory(req: Request, res: Response) {
  const category = await categoryService.getCategoryById(req.params.id!);
  res.json({ success: true, category });
}

export async function createCategory(req: Request, res: Response) {
  const input = req.body as CreateExpenseCategoryInput;
  const category = await categoryService.createCategory({
    name: input.name,
    description: input.description ?? null,
  });
  res.status(201).json({ success: true, category });
}

export async function updateCategory(req: Request, res: Response) {
  const input = req.body as UpdateExpenseCategoryInput;
  const category = await categoryService.updateCategory(req.params.id!, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  });
  res.json({ success: true, category });
}

// ---------- Expenses ----------

export async function listExpenses(req: Request, res: Response) {
  const parsed = ListExpensesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query parameters.');
  }
  const q = parsed.data;
  const expenses = await expenseService.listExpenses({
    actor: { id: req.user!.id, role: req.user!.role },
    businessDate: q.businessDate,
    from: q.from,
    to: q.to,
    categoryId: q.categoryId,
    status: q.status,
    paymentMethod: q.paymentMethod,
    createdBy: q.createdBy,
    includeRejected: q.includeRejected,
  });
  res.json({ success: true, expenses });
}

export async function getExpense(req: Request, res: Response) {
  const expense = await expenseService.getExpenseById(req.params.id!);
  res.json({ success: true, expense });
}

export async function createExpense(req: Request, res: Response) {
  const input = req.body as CreateExpenseInput;
  const expense = await expenseService.createExpense({
    actor: { id: req.user!.id, role: req.user!.role },
    businessDate: input.businessDate,
    categoryId: input.categoryId,
    shiftId: input.shiftId ?? null,
    paidByUserId: input.paidByUserId ?? null,
    amount: input.amount,
    paymentMethod: input.paymentMethod as PaymentMethod,
    description: input.description,
    receiptNumber: input.receiptNumber ?? null,
    attachmentPath: input.attachmentPath ?? null,
    notes: input.notes ?? null,
    autoApprove: input.autoApprove ?? false,
    submitNow: input.submitNow ?? false,
  });
  res.status(201).json({ success: true, expense });
}

export async function updateExpense(req: Request, res: Response) {
  const input = req.body as UpdateExpenseInput;
  const expense = await expenseService.updateExpense({
    id: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role },
    categoryId: input.categoryId,
    shiftId: input.shiftId,
    paidByUserId: input.paidByUserId,
    amount: input.amount,
    paymentMethod: input.paymentMethod as PaymentMethod | undefined,
    description: input.description,
    receiptNumber: input.receiptNumber,
    attachmentPath: input.attachmentPath,
    notes: input.notes,
  });
  res.json({ success: true, expense });
}

export async function submitExpense(req: Request, res: Response) {
  const expense = await expenseService.submitExpense({
    id: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role },
  });
  res.json({ success: true, expense });
}

export async function approveExpense(req: Request, res: Response) {
  const expense = await expenseService.approveExpense({
    id: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role },
  });
  res.json({ success: true, expense });
}

export async function rejectExpense(req: Request, res: Response) {
  const input = req.body as RejectExpenseInput;
  const expense = await expenseService.rejectExpense({
    id: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role },
    reason: input.reason,
  });
  res.json({ success: true, expense });
}