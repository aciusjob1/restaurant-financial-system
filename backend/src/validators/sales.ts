import { z } from 'zod';
import { titleCaseName } from '../utils/textCase.js';

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
  // MANAGER/OWNER may pass userId to fetch another user's summary.
  // The controller rejects the override for any other role.
  userId: z.string().min(1).optional(),
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

// For POST /:id/waiter-collections — the waiter's (or manager's) submission
// of the day's actual money movements. M-Pesa entries go to `Collection`
// (mobileReference = payer name); expenses go to `Expense` on the DAILY
// category. The service never touches `SalesSummary`. Declared sales and
// recorded collections are independent inputs to the closing comparison.
//
// Amounts accept MoneyString (up to 2 decimal places, within Decimal(14,2)).
// Negative amounts are not currently rejected at the schema level; the
// service trusts the validator. If we want positivity enforced, add a
// PositiveMoneyString variant here and switch these two `amount` fields.
//
// Payer names are stored in Collection.mobileReference, which has a partial
// unique index on (shiftId, paymentMethod, mobileReference) scoped to active
// (non-voided) rows. Two distinct payers with the same name on the same shift
// cannot coexist — the second POST returns 409 DUPLICATE_MOBILE_REFERENCE.
// That is a documented, deliberate limitation, not a bug.
export const WaiterCollectionsSchema = z.object({
  mpesaEntries: z
    .array(
      z.object({
        payerName: z.string().trim().min(1).max(64).transform(titleCaseName),
        amount: MoneyString,
      })
    )
    .default([]),
  expenses: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        description: z.string().trim().min(1).max(200),
        amount: MoneyString,
        // Required when the category is the SALARY system category.
        // The service enforces that. Left optional in the schema so the
        // error can carry a specific code.
        salaryTargetEmployeeId: z.string().min(1).optional(),
      })
    )
    .default([]),
});
export type WaiterCollectionsInput = z.infer<typeof WaiterCollectionsSchema>;
