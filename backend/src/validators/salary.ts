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

export const CreateSalaryRecordSchema = z.object({
  employeeId: z.string().min(1),
  periodStart: DateOnly,
  periodEnd: DateOnly,
  label: z.string().trim().min(1).max(64),
  baseSalary: PositiveMoneyString,
  adjustments: MoneyString.optional(),
  deductions: MoneyString.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const UpdateSalaryRecordSchema = z.object({
  periodStart: DateOnly.optional(),
  periodEnd: DateOnly.optional(),
  label: z.string().trim().min(1).max(64).optional(),
  baseSalary: PositiveMoneyString.optional(),
  adjustments: MoneyString.optional(),
  deductions: MoneyString.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const CreateSalaryPaymentSchema = z.object({
  salaryRecordId: z.string().min(1),
  amount: PositiveMoneyString,
  paymentMethod: z.enum(PAYMENT_METHODS),
  businessDate: DateOnly,
  reference: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const VoidSalaryPaymentSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const ListSalariesQuerySchema = z.object({
  employeeId: z.string().min(1).optional(),
  from: DateOnly.optional(),
  to: DateOnly.optional(),
  status: z.enum(['DRAFT', 'APPROVED', 'PAID']).optional(),
  unpaidOnly: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export const ListSalaryPaymentsQuerySchema = z.object({
  salaryRecordId: z.string().min(1).optional(),
  employeeId: z.string().min(1).optional(),
  businessDate: DateOnly.optional(),
  from: DateOnly.optional(),
  to: DateOnly.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  includeVoided: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export type CreateSalaryRecordInput = z.infer<typeof CreateSalaryRecordSchema>;
export type UpdateSalaryRecordInput = z.infer<typeof UpdateSalaryRecordSchema>;
export type CreateSalaryPaymentInput = z.infer<typeof CreateSalaryPaymentSchema>;
export type VoidSalaryPaymentInput = z.infer<typeof VoidSalaryPaymentSchema>;
export type ListSalariesQuery = z.infer<typeof ListSalariesQuerySchema>;
export type ListSalaryPaymentsQuery = z.infer<typeof ListSalaryPaymentsQuerySchema>;