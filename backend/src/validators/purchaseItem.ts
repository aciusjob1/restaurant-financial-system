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

const QuantityString = z
  .string()
  .regex(/^-?\d+(\.\d{1,3})?$/, 'Must be a decimal string with up to 3 places')
  .refine((v) => v.replace('-', '').replace('.', '').length <= 14, {
    message: 'Too many digits for Decimal(14,3)',
  });

const PositiveQuantityString = QuantityString.refine(
  (v) => !v.startsWith('-') && parseFloat(v) > 0,
  { message: 'Quantity must be positive.' }
);

export const PurchaseItemInputSchema = z.object({
  materialId: z.string().min(1),
  quantity: PositiveQuantityString,
  unitPrice: PositiveMoneyString,
  notes: z.string().trim().max(500).nullable().optional(),
});

export const ReplacePurchaseItemsSchema = z.object({
  items: z.array(PurchaseItemInputSchema).min(1),
});

export type PurchaseItemInputInput = z.infer<typeof PurchaseItemInputSchema>;
export type ReplacePurchaseItemsInput = z.infer<typeof ReplacePurchaseItemsSchema>;