import { z } from 'zod';

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

export const CreateCashHandoverSchema = z.object({
  shiftId: z.string().min(1),
  amount: PositiveMoneyString,
  toUserId: z.string().min(1),
  notes: z.string().trim().max(500).nullable().optional(),
  onBehalfOfUserId: z.string().min(1).nullable().optional(),
});

export const ConfirmCashHandoverSchema = z.object({
  confirmedNotes: z.string().trim().max(500).optional(),
});

export const VoidCashHandoverSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const ListCashHandoversQuerySchema = z.object({
  shiftId: z.string().min(1).optional(),
  reconciliationId: z.string().min(1).optional(),
  fromUserId: z.string().min(1).optional(),
  toUserId: z.string().min(1).optional(),
  status: z.enum(['PENDING', 'CONFIRMED']).optional(),
  includeVoided: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export type CreateCashHandoverInput = z.infer<typeof CreateCashHandoverSchema>;
export type ConfirmCashHandoverInput = z.infer<typeof ConfirmCashHandoverSchema>;
export type VoidCashHandoverInput = z.infer<typeof VoidCashHandoverSchema>;
export type ListCashHandoversQuery = z.infer<typeof ListCashHandoversQuerySchema>;