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

export const PublicPurchaseItem = z.object({
  id: z.string(),
  purchaseInvoiceId: z.string(),
  materialId: z.string().nullable(),
  quantity: z.string(),
  unitPrice: MoneyString,
  total: MoneyString,
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type PublicPurchaseItem = z.infer<typeof PublicPurchaseItem>;

export const PurchaseItemInput = z.object({
  materialId: z.string().min(1),
  quantity: PositiveQuantityString,
  unitPrice: PositiveMoneyString,
  notes: z.string().trim().max(500).nullable().optional(),
});
export type PurchaseItemInput = z.infer<typeof PurchaseItemInput>;

export const ReplacePurchaseItemsRequest = z.object({
  items: z.array(PurchaseItemInput).min(1),
});
export type ReplacePurchaseItemsRequest = z.infer<typeof ReplacePurchaseItemsRequest>;

export const PurchaseItemsListResponse = z.object({
  success: z.literal(true),
  items: z.array(PublicPurchaseItem),
});
export type PurchaseItemsListResponse = z.infer<typeof PurchaseItemsListResponse>;