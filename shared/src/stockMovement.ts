import { z } from 'zod';

const MoneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal string with up to 2 places');

const QuantityString = z
  .string()
  .regex(/^-?\d+(\.\d{1,3})?$/, 'Must be a decimal string with up to 3 places');

const PositiveQuantityString = QuantityString.refine(
  (v) => !v.startsWith('-') && parseFloat(v) > 0,
  { message: 'Quantity must be positive.' }
);

export const StockMovementTypes = [
  'PURCHASE',
  'OPENING',
  'CONSUMPTION',
  'WASTE',
  'ADJUSTMENT',
] as const;
export type StockMovementType = (typeof StockMovementTypes)[number];

export const StockMovementDirections = ['IN', 'OUT'] as const;
export type StockMovementDirection = (typeof StockMovementDirections)[number];

// Types creatable via the manual API. PURCHASE is reserved for invoice posting.
export const ManualStockMovementTypes = [
  'OPENING',
  'CONSUMPTION',
  'WASTE',
  'ADJUSTMENT',
] as const;

export const PublicStockMovement = z.object({
  id: z.string(),
  movementNumber: z.string(),
  materialId: z.string(),
  type: z.enum(StockMovementTypes),
  direction: z.enum(StockMovementDirections),
  businessDate: z.string(),
  quantity: QuantityString,
  unitCost: MoneyString.nullable(),
  totalCost: MoneyString.nullable(),
  purchaseItemId: z.string().nullable(),
  reversalOfId: z.string().nullable(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
});
export type PublicStockMovement = z.infer<typeof PublicStockMovement>;

export const CreateStockMovementRequest = z.object({
  materialId: z.string().min(1),
  type: z.enum(ManualStockMovementTypes),
  direction: z.enum(StockMovementDirections),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'businessDate must be YYYY-MM-DD'),
  quantity: PositiveQuantityString,
  unitCost: MoneyString.nullable().optional(),
  reference: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type CreateStockMovementRequest = z.infer<typeof CreateStockMovementRequest>;

export const StockMovementsListResponse = z.object({
  success: z.literal(true),
  movements: z.array(PublicStockMovement),
});
export type StockMovementsListResponse = z.infer<typeof StockMovementsListResponse>;