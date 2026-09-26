import { z } from 'zod';

export const EXPENSE_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

const MoneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal string with up to 2 places')
  .refine((v) => v.replace('-', '').replace('.', '').length <= 14, {
    message: 'Too many digits for Decimal(14,2)',
  });

const PositiveMoneyString = MoneyString.refine((v) => !v.startsWith('-') && parseFloat(v) > 0, {
  message: 'Amount must be positive.',
});

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const PAYMENT_METHODS = [
  'CASH',
  'MPESA',
  'AIRTEL_MONEY',
  'TIGO_PESA',
  'HALOPESA',
  'BANK',
  'CARD',
  'OTHER',
] as const;

export const PublicExpenseCategory = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type PublicExpenseCategory = z.infer<typeof PublicExpenseCategory>;

export const CreateExpenseCategoryRequest = z.object({
  name: z.string().trim().min(2).max(64),
  description: z.string().trim().max(500).nullable().optional(),
});
export type CreateExpenseCategoryRequest = z.infer<typeof CreateExpenseCategoryRequest>;

export const UpdateExpenseCategoryRequest = z.object({
  name: z.string().trim().min(2).max(64).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateExpenseCategoryRequest = z.infer<typeof UpdateExpenseCategoryRequest>;

export const PublicExpense = z.object({
  id: z.string(),
  expenseNumber: z.string(),
  businessDate: DateOnly,
  categoryId: z.string(),
  shiftId: z.string().nullable(),
  createdBy: z.string(),
  approvedBy: z.string().nullable(),
  amount: MoneyString,
  paymentMethod: z.enum(PAYMENT_METHODS),
  description: z.string(),
  receiptNumber: z.string().nullable(),
  attachmentPath: z.string().nullable(),
  status: z.enum(EXPENSE_STATUSES),
  notes: z.string().nullable(),
  rejectedReason: z.string().nullable(),
  submittedAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicExpense = z.infer<typeof PublicExpense>;

export const CreateExpenseRequest = z.object({
  businessDate: DateOnly,
  categoryId: z.string().min(1),
  shiftId: z.string().nullable().optional(),
  amount: PositiveMoneyString,
  paymentMethod: z.enum(PAYMENT_METHODS),
  description: z.string().trim().min(2).max(500),
  receiptNumber: z.string().trim().max(64).nullable().optional(),
  attachmentPath: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type CreateExpenseRequest = z.infer<typeof CreateExpenseRequest>;

export const UpdateExpenseRequest = z.object({
  categoryId: z.string().min(1).optional(),
  shiftId: z.string().nullable().optional(),
  amount: PositiveMoneyString.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  description: z.string().trim().min(2).max(500).optional(),
  receiptNumber: z.string().trim().max(64).nullable().optional(),
  attachmentPath: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type UpdateExpenseRequest = z.infer<typeof UpdateExpenseRequest>;

export const RejectExpenseRequest = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type RejectExpenseRequest = z.infer<typeof RejectExpenseRequest>;

export const ExpensesListResponse = z.object({
  success: z.literal(true),
  expenses: z.array(PublicExpense),
});
export type ExpensesListResponse = z.infer<typeof ExpensesListResponse>;

export const ExpenseResponse = z.object({
  success: z.literal(true),
  expense: PublicExpense,
});
export type ExpenseResponse = z.infer<typeof ExpenseResponse>;

export const ExpenseCategoriesListResponse = z.object({
  success: z.literal(true),
  categories: z.array(PublicExpenseCategory),
});
export type ExpenseCategoriesListResponse = z.infer<typeof ExpenseCategoriesListResponse>;

export const ExpenseCategoryResponse = z.object({
  success: z.literal(true),
  category: PublicExpenseCategory,
});
export type ExpenseCategoryResponse = z.infer<typeof ExpenseCategoryResponse>;

export const AttachmentUploadResponse = z.object({
  success: z.literal(true),
  attachmentPath: z.string(),
  bytes: z.number().int().nonnegative(),
  mimeType: z.string(),
});
export type AttachmentUploadResponse = z.infer<typeof AttachmentUploadResponse>;