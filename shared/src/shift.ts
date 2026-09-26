import { z } from 'zod';

export const SHIFT_STATUSES = ['OPEN', 'SUBMITTED', 'RECONCILING', 'CLOSED'] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

const MoneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal string with up to 2 places');

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const PublicShift = z.object({
  id: z.string(),
  userId: z.string(),
  businessDate: DateOnly,
  status: z.enum(SHIFT_STATUSES),
  openingCash: MoneyString.nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  submittedAt: z.string().nullable(),
  reviewedBy: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  closedBy: z.string().nullable(),
  closedAt: z.string().nullable(),
  reopenedBy: z.string().nullable(),
  reopenedAt: z.string().nullable(),
  reopenReason: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type PublicShift = z.infer<typeof PublicShift>;

export const StartShiftRequest = z.object({
  businessDate: DateOnly.optional(),
  openingCash: MoneyString.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type StartShiftRequest = z.infer<typeof StartShiftRequest>;

export const TransitionShiftRequest = z.object({
  to: z.enum(SHIFT_STATUSES),
  reason: z.string().trim().max(500).optional(),
});
export type TransitionShiftRequest = z.infer<typeof TransitionShiftRequest>;

export const ShiftsListResponse = z.object({
  success: z.literal(true),
  shifts: z.array(PublicShift),
});
export type ShiftsListResponse = z.infer<typeof ShiftsListResponse>;

export const ShiftResponse = z.object({
  success: z.literal(true),
  shift: PublicShift,
});
export type ShiftResponse = z.infer<typeof ShiftResponse>;