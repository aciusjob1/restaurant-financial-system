import { z } from 'zod';

const MoneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal string with up to 2 places');

const QuantityString = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, 'Must be a decimal string with up to 3 places');

const PositiveQuantityString = QuantityString.refine(
  (v) => parseFloat(v) > 0,
  { message: 'Quantity must be positive.' }
);

export const CreateStockMovementSchema = z.object({
  materialId: z.string().min(1),
  type: z.enum(['OPENING', 'CONSUMPTION', 'WASTE', 'ADJUSTMENT']),
  direction: z.enum(['IN', 'OUT']),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: PositiveQuantityString,
  unitCost: MoneyString.nullable().optional(),
  reference: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const ListStockMovementsQuery = z.object({
  materialId: z.string().optional(),
  type: z.enum(['PURCHASE', 'OPENING', 'CONSUMPTION', 'WASTE', 'ADJUSTMENT']).optional(),
  direction: z.enum(['IN', 'OUT']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type CreateStockMovementInput = z.infer<typeof CreateStockMovementSchema>;
export type ListStockMovementsQueryInput = z.infer<typeof ListStockMovementsQuery>;