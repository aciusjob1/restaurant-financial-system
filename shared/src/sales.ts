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
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SALES_SUMMARY_SOURCES = ['EXISTING_POS', 'MANUAL', 'IMPORT', 'FUTURE_API'] as const;
export type SalesSummarySource = (typeof SALES_SUMMARY_SOURCES)[number];

export const SALES_SUMMARY_STATUSES = ['DRAFT', 'VERIFIED'] as const;
export type SalesSummaryStatus = (typeof SALES_SUMMARY_STATUSES)[number];

const MoneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal string with up to 2 places')
  .refine((v) => v.replace('-', '').replace('.', '').length <= 14, {
    message: 'Too many digits for Decimal(14,2)',
  });

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const PublicSalesSummaryLine = z.object({
  id: z.string(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  amount: MoneyString,
  notes: z.string().nullable(),
});
export type PublicSalesSummaryLine = z.infer<typeof PublicSalesSummaryLine>;

export const PublicSalesSummary = z.object({
  id: z.string(),
  businessDate: DateOnly,
  source: z.enum(SALES_SUMMARY_SOURCES),
  sourceReference: z.string(),
  status: z.enum(SALES_SUMMARY_STATUSES),
  totalSales: MoneyString,
  cashSales: MoneyString,
  mobileSales: MoneyString,
  otherSales: MoneyString,
  enteredBy: z.string().nullable(),
  verifiedBy: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  notes: z.string().nullable(),
  lines: z.array(PublicSalesSummaryLine),
  createdAt: z.string(),
});
export type PublicSalesSummary = z.infer<typeof PublicSalesSummary>;

export const SalesSummariesListResponse = z.object({
  success: z.literal(true),
  summaries: z.array(PublicSalesSummary),
});
export type SalesSummariesListResponse = z.infer<typeof SalesSummariesListResponse>;

export const SalesSummaryResponse = z.object({
  success: z.literal(true),
  summary: PublicSalesSummary,
});
export type SalesSummaryResponse = z.infer<typeof SalesSummaryResponse>;

export const ManualSalesSummaryRequest = z.object({
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
export type ManualSalesSummaryRequest = z.infer<typeof ManualSalesSummaryRequest>;

export const ImportResultResponse = z.object({
  success: z.literal(true),
  imported: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  summaries: z.array(PublicSalesSummary),
});
export type ImportResultResponse = z.infer<typeof ImportResultResponse>;