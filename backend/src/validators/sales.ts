import { z } from 'zod';

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

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ManualSalesSummarySchema = z.object({
  businessDate: DateOnly,
  sourceReference: z.string().trim().max(128).optional().default(''),
  notes: z.string().trim().max(500).nullable().optional(),
  lines: z
    .array(
      z.object({
        paymentMethod: z.enum(PAYMENT_METHODS),
        amount: MoneyString,
        notes: z.string().trim().max(500).nullable().optional(),
      })
    )
    .min(1),
});

export const ListSalesSummariesQuerySchema = z.object({
  businessDate: DateOnly.optional(),
  source: z.enum(['EXISTING_POS', 'MANUAL', 'IMPORT', 'FUTURE_API']).optional(),
});

export type ManualSalesSummaryInput = z.infer<typeof ManualSalesSummarySchema>;
export type ListSalesSummariesQuery = z.infer<typeof ListSalesSummariesQuerySchema>;