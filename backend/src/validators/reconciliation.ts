import { z } from 'zod';

const MoneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal string with up to 2 places')
  .refine((v) => v.replace('-', '').replace('.', '').length <= 14, {
    message: 'Too many digits for Decimal(14,2)',
  });

const NonNegativeMoneyString = MoneyString.refine(
  (v) => !v.startsWith('-'),
  { message: 'Amount must not be negative.' }
);

export const CreateReconciliationSchema = z.object({
  shiftId: z.string().min(1),
  actualCash: NonNegativeMoneyString.optional(),
  actualMobile: NonNegativeMoneyString.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const UpdateReconciliationSchema = z.object({
  actualCash: NonNegativeMoneyString.optional(),
  actualMobile: NonNegativeMoneyString.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const ReviewReconciliationSchema = z.object({
  decision: z.enum(['APPROVE', 'SEND_BACK']),
  reviewNotes: z.string().trim().max(500).optional(),
});

export const ListReconciliationsQuerySchema = z.object({
  shiftId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'REVIEWED']).optional(),
});

export type CreateReconciliationInput = z.infer<typeof CreateReconciliationSchema>;
export type UpdateReconciliationInput = z.infer<typeof UpdateReconciliationSchema>;
export type ReviewReconciliationInput = z.infer<typeof ReviewReconciliationSchema>;
export type ListReconciliationsQuery = z.infer<typeof ListReconciliationsQuerySchema>;