import { z } from 'zod';

const MoneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal string with up to 2 places')
  .refine((v) => v.replace('-', '').replace('.', '').length <= 14, {
    message: 'Too many digits for Decimal(14,2)',
  });

export const ListQuerySchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
});

export const UpsertReceiptSchema = z
  .object({
    userId: z.string().min(1),
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(['APPROVED', 'INSUFFICIENT', 'NO_NETCASH_HANDED_OVER']),
    amountReceived: MoneyString.nullable().optional(),
    expectedUpdatedAt: z.string().datetime(),
  })
  .refine(
    (v) => v.status !== 'INSUFFICIENT' || (v.amountReceived != null && v.amountReceived !== ''),
    { message: 'amountReceived is required when status is INSUFFICIENT', path: ['amountReceived'] }
  );

export type ListQuery = z.infer<typeof ListQuerySchema>;
export type UpsertReceiptInput = z.infer<typeof UpsertReceiptSchema>;