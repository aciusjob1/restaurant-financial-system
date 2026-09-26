import { z } from 'zod';

const DateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

const MoneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal string with up to 2 places')
  .refine((v) => v.replace('-', '').replace('.', '').length <= 14, {
    message: 'Too many digits for Decimal(14,2)',
  });

export const StartShiftSchema = z.object({
  businessDate: DateOnly.optional(),
  openingCash: MoneyString.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const TransitionShiftSchema = z.object({
  to: z.enum(['SUBMITTED', 'RECONCILING', 'CLOSED', 'OPEN']),
  reason: z.string().trim().max(500).optional(),
});

export const ListShiftsQuerySchema = z.object({
  userId: z.string().min(1).optional(),
  status: z.enum(['OPEN', 'SUBMITTED', 'RECONCILING', 'CLOSED']).optional(),
  businessDate: DateOnly.optional(),
});

export type StartShiftInput = z.infer<typeof StartShiftSchema>;
export type TransitionShiftInput = z.infer<typeof TransitionShiftSchema>;
export type ListShiftsQuery = z.infer<typeof ListShiftsQuerySchema>;