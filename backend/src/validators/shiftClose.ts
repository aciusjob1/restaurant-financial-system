import { z } from 'zod';
import { titleCaseName } from '../utils/textCase.js';

const PAYMENT_METHODS = [
  'CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA',
  'HALOPESA', 'BANK', 'CARD', 'OTHER',
] as const;

const MoneyString = z
  .string()
  .regex(/^-?[0-9]+(\.[0-9]{1,2})?$/, 'Must be a decimal string with up to 2 places')
  .refine((v) => v.replace('-', '').replace('.', '').length <= 14, {
    message: 'Too many digits for Decimal(14,2)',
  });

const PositiveMoneyString = MoneyString.refine(
  (v) => !v.startsWith('-') && parseFloat(v) > 0,
  { message: 'Amount must be positive.' }
);

// A single mobile-money payment, identified by the payer's name.
//
// NOTE: payerName is stored in Collection.mobileReference, which has a
// unique constraint per shift. Two distinct payers with the same name in
// the same shift will conflict — the second entry will 409 with
// DUPLICATE_MOBILE_REFERENCE. This is a known limitation of the current
// schema; it is NOT silently worked around (no auto-suffixing, no name
// mangling). If two payers with the same name appear on the same shift,
// the operator must disambiguate the reference at entry time.
const MpesaEntrySchema = z.object({
  payerName: z.string().trim().min(1).max(64).transform(titleCaseName),
  amount: PositiveMoneyString,
});

const ExpenseLineSchema = z.object({
  categoryId: z.string().min(1),
  amount: PositiveMoneyString,
  paymentMethod: z.enum(PAYMENT_METHODS),
  description: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(500).nullable().optional(),
  paidByUserId: z.string().min(1).nullable().optional(),
});

// Waiter-side close: the system computes Net Cash from SalesSummary minus
// the mobile entries and expenses. cashHandedOver is NOT accepted from the
// client; the server sets it.
export const CloseMoneySchema = z.object({
  mpesaEntries: z.array(MpesaEntrySchema).optional(),
  expenses: z.array(ExpenseLineSchema).optional(),
  receivedByUserId: z.string().min(1).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export type CloseMoneyInput = z.infer<typeof CloseMoneySchema>;

export const CompleteShiftSchema = z.object({
  expenses: z.array(ExpenseLineSchema).optional(),
  cashHandedOver: MoneyString,
  receivedByUserId: z.string().min(1).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export type CompleteShiftInput = z.infer<typeof CompleteShiftSchema>;

export const SubmitShiftSchema = z.object({
  mpesaEntries: z.array(MpesaEntrySchema).optional(),
  expenses: z.array(ExpenseLineSchema).optional(),
  receivedByUserId: z.string().min(1).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export type SubmitShiftInput = z.infer<typeof SubmitShiftSchema>;