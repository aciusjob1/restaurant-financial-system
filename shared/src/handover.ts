import { z } from 'zod';

export const CASH_HANDOVER_STATUSES = ['PENDING', 'CONFIRMED'] as const;
export type CashHandoverStatus = (typeof CASH_HANDOVER_STATUSES)[number];

const MoneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal string with up to 2 places');

export const PublicCashHandover = z.object({
  id: z.string(),
  reconciliationId: z.string(),
  fromUserId: z.string(),
  toUserId: z.string(),
  amount: MoneyString,
  status: z.enum(CASH_HANDOVER_STATUSES),
  handedOverAt: z.string(),
  confirmedAt: z.string().nullable(),
  notes: z.string().nullable(),
  confirmedNotes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicCashHandover = z.infer<typeof PublicCashHandover>;

// Note: no `amount` field — the server always derives it from the
// linked reconciliation's actualCash. Client cannot choose it.
export const CreateCashHandoverRequest = z.object({
  reconciliationId: z.string().min(1),
  toUserId: z.string().min(1),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type CreateCashHandoverRequest = z.infer<typeof CreateCashHandoverRequest>;

export const ConfirmCashHandoverRequest = z.object({
  confirmedNotes: z.string().trim().max(500).optional(),
});
export type ConfirmCashHandoverRequest = z.infer<typeof ConfirmCashHandoverRequest>;

export const CashHandoversListResponse = z.object({
  success: z.literal(true),
  handovers: z.array(PublicCashHandover),
});
export type CashHandoversListResponse = z.infer<typeof CashHandoversListResponse>;

export const CashHandoverResponse = z.object({
  success: z.literal(true),
  handover: PublicCashHandover,
});
export type CashHandoverResponse = z.infer<typeof CashHandoverResponse>;