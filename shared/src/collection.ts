import { z } from 'zod';
import { PAYMENT_METHODS } from './sales.js';

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

export const PublicCollection = z.object({
  id: z.string(),
  shiftId: z.string(),
  userId: z.string(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  amount: MoneyString,
  mobileReference: z.string().nullable(),
  notes: z.string().nullable(),
  voidedAt: z.string().nullable(),
  voidedBy: z.string().nullable(),
  voidReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicCollection = z.infer<typeof PublicCollection>;

export const CreateCollectionRequest = z.object({
  shiftId: z.string().min(1),
  paymentMethod: z.enum(PAYMENT_METHODS),
  amount: PositiveMoneyString,
  mobileReference: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type CreateCollectionRequest = z.infer<typeof CreateCollectionRequest>;

export const UpdateCollectionRequest = z.object({
  amount: PositiveMoneyString.optional(),
  mobileReference: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type UpdateCollectionRequest = z.infer<typeof UpdateCollectionRequest>;

export const VoidCollectionRequest = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type VoidCollectionRequest = z.infer<typeof VoidCollectionRequest>;

export const CollectionsListResponse = z.object({
  success: z.literal(true),
  collections: z.array(PublicCollection),
});
export type CollectionsListResponse = z.infer<typeof CollectionsListResponse>;

export const CollectionResponse = z.object({
  success: z.literal(true),
  collection: PublicCollection,
});
export type CollectionResponse = z.infer<typeof CollectionResponse>;