import { z } from 'zod';

const PAYMENT_METHODS = [
  'CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA',
  'HALOPESA', 'BANK', 'CARD', 'OTHER',
] as const;

const MoneyString = z
  .string()
  .regex(/^-?[0-9]+(\.[0-9]{1,2})?$/, 'Must be a decimal string with up to 2 places')
  .refine((v) => v.replace('-', '').replace('.', '').length <= 14, {
    message: 'Too many digits for Decimal(14,2)',
  });

const PositiveMoneyString = MoneyString.refine(
  (v) => !v.startsWith('-') && parseFloat(v) > 0,
  { message: 'Amount must be positive.' }
);

const CollectionsSchema = z.object({
  cash: MoneyString.optional(),
  mpesa: MoneyString.optional(),
  airtelMoney: MoneyString.optional(),
  tigoPesa: MoneyString.optional(),
  halopesa: MoneyString.optional(),
  bank: MoneyString.optional(),
  card: MoneyString.optional(),
  other: MoneyString.optional(),
});

const ExpenseLineSchema = z.object({
  categoryId: z.string().min(1),
  amount: PositiveMoneyString,
  paymentMethod: z.enum(PAYMENT_METHODS),
  description: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(500).nullable().optional(),
  paidByUserId: z.string().min(1).nullable().optional(),
});

export const CloseMoneySchema = z.object({
  collections: CollectionsSchema,
  expenses: z.array(ExpenseLineSchema).optional(),
  cashHandedOver: MoneyString,
  receivedByUserId: z.string().min(1),
  notes: z.string().trim().max(500).nullable().optional(),
});

export type CloseMoneyInput = z.infer<typeof CloseMoneySchema>;

export const CompleteShiftSchema = z.object({
  expenses: z.array(ExpenseLineSchema).optional(),
  cashHandedOver: MoneyString,
  receivedByUserId: z.string().min(1),
  notes: z.string().trim().max(500).nullable().optional(),
});

export type CompleteShiftInput = z.infer<typeof CompleteShiftSchema>;

export const SubmitShiftSchema = z.object({
  collections: CollectionsSchema.optional(),
  expenses: z.array(ExpenseLineSchema).optional(),
  cashHandedOver: MoneyString,
  receivedByUserId: z.string().min(1),
  notes: z.string().trim().max(500).nullable().optional(),
});

export type SubmitShiftInput = z.infer<typeof SubmitShiftSchema>;
