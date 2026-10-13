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
  userId: z.string().min(1).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  // Optional explicit total for callers that receive a number on a
  // paper form (e.g. the waiter daily report) rather than itemised lines.
  // When absent, totalSales remains derived from `lines` — same as before.
  totalSales: MoneyString.optional(),
  // When true, allow replacing an existing MANUAL summary for the same
  // waiter + date. When false/absent, the controller returns 409
  // SUMMARY_EXISTS so the manager confirms the replacement explicitly.
  overwrite: z.boolean().optional(),
  // Lines may be empty when the caller supplies an explicit totalSales
  // and only wants to record the aggregate figure.
  lines: z
    .array(
      z.object({
        paymentMethod: z.enum(PAYMENT_METHODS),
        amount: MoneyString,
        notes: z.string().trim().max(500).nullable().optional(),
      })
    )
    .min(0),
  // Optional expense rows for the daily report. Semantics:
  //   undefined  → no expense handling (legacy callers, CSV import)
  //   []         → supersede any prior DAILY expenses for this user/date
  //   [{...}]    → supersede prior and create these rows
  expenseRows: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(200),
        amount: MoneyString,
      })
    )
    .optional(),
});

export const ListSalesSummariesQuerySchema = z.object({
  businessDate: DateOnly.optional(),
  source: z.enum(['EXISTING_POS', 'MANUAL', 'IMPORT', 'FUTURE_API']).optional(),
});

export type ManualSalesSummaryInput = z.infer<typeof ManualSalesSummarySchema>;
export type ListSalesSummariesQuery = z.infer<typeof ListSalesSummariesQuerySchema>;

// For GET /mine — a waiter fetches the summary the manager/cashier entered
// for them today, plus their currently-active DAILY expenses, so the kiosk
// can pre-populate the form for resubmission.
export const MySummaryQuerySchema = z.object({
  businessDate: DateOnly.optional(),
});
export type MySummaryQuery = z.infer<typeof MySummaryQuerySchema>;

// For POST /:id/waiter-report — the waiter fills in the M-Pesa breakdown
// and their expenses. Total Sales stays as entered upstream; this endpoint
// never touches it.
export const WaiterReportSchema = z.object({
  mpesaRows: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        amount: MoneyString,
      })
    )
    .default([]),
  expenseRows: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(200),
        amount: MoneyString,
      })
    )
    .default([]),
});
export type WaiterReportInput = z.infer<typeof WaiterReportSchema>;