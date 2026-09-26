import { z } from 'zod';

export const RECONCILIATION_STATUSES = ['DRAFT', 'SUBMITTED', 'REVIEWED'] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

const MoneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal string with up to 2 places')
  .refine((v) => v.replace('-', '').replace('.', '').length <= 14, {
    message: 'Too many digits for Decimal(14,2)',
  });

export const NonNegativeMoneyString = MoneyString.refine(
  (v) => !v.startsWith('-'),
  { message: 'Amount must not be negative.' }
);

export const PublicReconciliation = z.object({
  id: z.string(),
  shiftId: z.string(),
  userId: z.string(),
  expectedCash: MoneyString,
  expectedMobile: MoneyString,
  actualCash: MoneyString.nullable(),
  actualMobile: MoneyString.nullable(),
  cashDifference: MoneyString.nullable(),
  mobileDifference: MoneyString.nullable(),
  status: z.enum(RECONCILIATION_STATUSES),
  notes: z.string().nullable(),
  submittedAt: z.string().nullable(),
  reviewedBy: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  reviewNotes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicReconciliation = z.infer<typeof PublicReconciliation>;

export const CreateReconciliationRequest = z.object({
  shiftId: z.string().min(1),
  actualCash: NonNegativeMoneyString.optional(),
  actualMobile: NonNegativeMoneyString.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type CreateReconciliationRequest = z.infer<typeof CreateReconciliationRequest>;

export const UpdateReconciliationRequest = z.object({
  actualCash: NonNegativeMoneyString.optional(),
  actualMobile: NonNegativeMoneyString.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type UpdateReconciliationRequest = z.infer<typeof UpdateReconciliationRequest>;

export const ReviewReconciliationRequest = z.object({
  decision: z.enum(['APPROVE', 'SEND_BACK']),
  reviewNotes: z.string().trim().max(500).optional(),
});
export type ReviewReconciliationRequest = z.infer<typeof ReviewReconciliationRequest>;

export const ReconciliationsListResponse = z.object({
  success: z.literal(true),
  reconciliations: z.array(PublicReconciliation),
});
export type ReconciliationsListResponse = z.infer<typeof ReconciliationsListResponse>;

export const ReconciliationResponse = z.object({
  success: z.literal(true),
  reconciliation: PublicReconciliation,
});
export type ReconciliationResponse = z.infer<typeof ReconciliationResponse>;