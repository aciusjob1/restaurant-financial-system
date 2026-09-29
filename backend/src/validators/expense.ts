import { z } from 'zod';

const PAYMENT_METHODS = [
  'CASH',
  'MPESA',
  'AIRTEL_MONEY',
  'TIGO_PESA',
  'HALOPESA',
  'BANK',
  'CARD',
  'OTHER',
] as const;

const MoneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal string with up to 2 places')
  .refine((v) => v.replace('-', '').replace('.', '').length <= 14, {
    message: 'Too many digits for Decimal(14,2)',
  });

const PositiveMoneyString = MoneyString.refine(
  (v) => !v.startsWith('-') && parseFloat(v) > 0,
  { message: 'Amount must be positive.' }
);

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

export const CreateExpenseCategorySchema = z.object({
  name: z.string().trim().min(2).max(64),
  description: z.string().trim().max(500).nullable().optional(),
});

export const UpdateExpenseCategorySchema = z.object({
  name: z.string().trim().min(2).max(64).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const CreateExpenseSchema = z.object({
  businessDate: DateOnly,
  categoryId: z.string().min(1),
  shiftId: z.string().nullable().optional(),
  paidByUserId: z.string().min(1).nullable().optional(),
  amount: PositiveMoneyString,
  paymentMethod: z.enum(PAYMENT_METHODS),
  description: z.string().trim().min(2).max(500),
  receiptNumber: z.string().trim().max(64).nullable().optional(),
  attachmentPath: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  autoApprove: z.boolean().optional(),
});

export const UpdateExpenseSchema = z.object({
  categoryId: z.string().min(1).optional(),
  shiftId: z.string().nullable().optional(),
  paidByUserId: z.string().min(1).nullable().optional(),
  amount: PositiveMoneyString.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  description: z.string().trim().min(2).max(500).optional(),
  receiptNumber: z.string().trim().max(64).nullable().optional(),
  attachmentPath: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const RejectExpenseSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const ListExpensesQuerySchema = z.object({
  businessDate: DateOnly.optional(),
  from: DateOnly.optional(),
  to: DateOnly.optional(),
  categoryId: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  createdBy: z.string().min(1).optional(),
  includeRejected: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true' || v === undefined),
});

export type CreateExpenseCategoryInput = z.infer<typeof CreateExpenseCategorySchema>;
export type UpdateExpenseCategoryInput = z.infer<typeof UpdateExpenseCategorySchema>;
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseSchema>;
export type RejectExpenseInput = z.infer<typeof RejectExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof ListExpensesQuerySchema>;