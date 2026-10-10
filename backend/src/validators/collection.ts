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

export const CreateCollectionSchema = z.object({
  shiftId: z.string().min(1).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  amount: PositiveMoneyString,
  mobileReference: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  // MANAGER/OWNER only: attribute this collection to a specific waiter.
  // WAITER must omit or set to own id.
  onBehalfOfUserId: z.string().min(1).nullable().optional(),
});

export const UpdateCollectionSchema = z.object({
  amount: PositiveMoneyString.optional(),
  mobileReference: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const VoidCollectionSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const ListCollectionsQuerySchema = z.object({
  shiftId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  includeVoided: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export type CreateCollectionInput = z.infer<typeof CreateCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof UpdateCollectionSchema>;
export type VoidCollectionInput = z.infer<typeof VoidCollectionSchema>;
export type ListCollectionsQuery = z.infer<typeof ListCollectionsQuerySchema>;