import { z } from 'zod';

export const SALARY_STATUSES = ['DRAFT', 'APPROVED', 'PAID'] as const;
export type SalaryStatus = (typeof SALARY_STATUSES)[number];

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

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const PublicSalaryRecord = z.object({
  id: z.string(),
  salaryNumber: z.string(),
  employeeId: z.string(),
  periodStart: DateOnly,
  periodEnd: DateOnly,
  label: z.string(),
  baseSalary: MoneyString,
  adjustments: MoneyString,
  deductions: MoneyString,
  netSalary: MoneyString,
  status: z.enum(SALARY_STATUSES),
  notes: z.string().nullable(),
  createdBy: z.string(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicSalaryRecord = z.infer<typeof PublicSalaryRecord>;

export const PublicSalaryPayment = z.object({
  id: z.string(),
  salaryRecordId: z.string(),
  amount: MoneyString,
  paymentMethod: z.enum(PAYMENT_METHODS),
  businessDate: DateOnly,
  paidAt: z.string(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  recordedBy: z.string(),
  voidedAt: z.string().nullable(),
  voidedBy: z.string().nullable(),
  voidReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicSalaryPayment = z.infer<typeof PublicSalaryPayment>;

export const CreateSalaryRecordRequest = z.object({
  employeeId: z.string().min(1),
  periodStart: DateOnly,
  periodEnd: DateOnly,
  label: z.string().trim().min(1).max(64),
  baseSalary: PositiveMoneyString,
  adjustments: MoneyString.optional(),
  deductions: MoneyString.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type CreateSalaryRecordRequest = z.infer<typeof CreateSalaryRecordRequest>;

export const UpdateSalaryRecordRequest = z.object({
  periodStart: DateOnly.optional(),
  periodEnd: DateOnly.optional(),
  label: z.string().trim().min(1).max(64).optional(),
  baseSalary: PositiveMoneyString.optional(),
  adjustments: MoneyString.optional(),
  deductions: MoneyString.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type UpdateSalaryRecordRequest = z.infer<typeof UpdateSalaryRecordRequest>;

export const CreateSalaryPaymentRequest = z.object({
  salaryRecordId: z.string().min(1),
  amount: PositiveMoneyString,
  paymentMethod: z.enum(PAYMENT_METHODS),
  businessDate: DateOnly,
  reference: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type CreateSalaryPaymentRequest = z.infer<typeof CreateSalaryPaymentRequest>;

export const VoidSalaryPaymentRequest = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type VoidSalaryPaymentRequest = z.infer<typeof VoidSalaryPaymentRequest>;

export const SalaryRecordsListResponse = z.object({
  success: z.literal(true),
  salaries: z.array(PublicSalaryRecord),
});
export type SalaryRecordsListResponse = z.infer<typeof SalaryRecordsListResponse>;

export const SalaryRecordResponse = z.object({
  success: z.literal(true),
  salary: PublicSalaryRecord,
});
export type SalaryRecordResponse = z.infer<typeof SalaryRecordResponse>;

export const SalaryPaymentsListResponse = z.object({
  success: z.literal(true),
  payments: z.array(PublicSalaryPayment),
});
export type SalaryPaymentsListResponse = z.infer<typeof SalaryPaymentsListResponse>;

export const SalaryPaymentResponse = z.object({
  success: z.literal(true),
  payment: PublicSalaryPayment,
});
export type SalaryPaymentResponse = z.infer<typeof SalaryPaymentResponse>;