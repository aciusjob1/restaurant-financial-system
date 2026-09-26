import { z } from 'zod';

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

const Pagination = {
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
};

export const DailySalesQuery = z.object({
  from: DateString,
  to: DateString,
  ...Pagination,
});

export const ReconciliationQuery = z.object({
  from: DateString,
  to: DateString,
  userId: z.string().optional(),
  ...Pagination,
});

export const HandoversQuery = z.object({
  from: DateString,
  to: DateString,
  fromUserId: z.string().optional(),
  toUserId: z.string().optional(),
  status: z.enum(['PENDING', 'CONFIRMED']).optional(),
  ...Pagination,
});

export const ExpensesQuery = z.object({
  from: DateString,
  to: DateString,
  categoryId: z.string().optional(),
  status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']).optional(),
  paymentMethod: z
    .enum([
      'CASH',
      'MPESA',
      'AIRTEL_MONEY',
      'TIGO_PESA',
      'HALOPESA',
      'BANK',
      'CARD',
      'OTHER',
    ])
    .optional(),
  ...Pagination,
});

export const SupplierBalancesQuery = z.object({
  includeInactive: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional(),
});

export const SalesVsPosQuery = z.object({
  from: DateString,
  to: DateString,
  ...Pagination,
});

export const StockMovementsQuery = z.object({
  from: DateString,
  to: DateString,
  materialId: z.string().optional(),
  type: z
    .enum(['PURCHASE', 'OPENING', 'CONSUMPTION', 'WASTE', 'ADJUSTMENT'])
    .optional(),
  direction: z.enum(['IN', 'OUT']).optional(),
  ...Pagination,
});

export type DailySalesQueryInput = z.infer<typeof DailySalesQuery>;
export type ReconciliationQueryInput = z.infer<typeof ReconciliationQuery>;
export type HandoversQueryInput = z.infer<typeof HandoversQuery>;
export type ExpensesQueryInput = z.infer<typeof ExpensesQuery>;
export type SupplierBalancesQueryInput = z.infer<typeof SupplierBalancesQuery>;
export type SalesVsPosQueryInput = z.infer<typeof SalesVsPosQuery>;
export type StockMovementsQueryInput = z.infer<typeof StockMovementsQuery>;