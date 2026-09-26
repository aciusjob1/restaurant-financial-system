import { z } from 'zod';

export const DAILY_CLOSING_STATUSES = ['CLOSED', 'SUPERSEDED', 'REOPENED'] as const;
export type DailyClosingStatus = (typeof DAILY_CLOSING_STATUSES)[number];

const MoneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal string with up to 2 places');

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const PublicDailyClosing = z.object({
  id: z.string(),
  businessDate: DateOnly,
  version: z.number().int().positive(),
  status: z.enum(DAILY_CLOSING_STATUSES),

  salesSummaryTotal: MoneyString,
  salesSummaryCash: MoneyString,
  salesSummaryMobile: MoneyString,
  salesSummaryOther: MoneyString,

  expectedCash: MoneyString,
  expectedMobile: MoneyString,

  actualCash: MoneyString,
  actualMobile: MoneyString,
  cashDifference: MoneyString,
  mobileDifference: MoneyString,

  cashSalesDiscrepancy: MoneyString,
  mobileSalesDiscrepancy: MoneyString,
  otherSalesDiscrepancy: MoneyString,

  totalHandovers: z.number().int().nonnegative(),
  totalHandoverAmount: MoneyString,
  pendingHandoverCount: z.number().int().nonnegative(),
  pendingHandoverAmount: MoneyString,
  confirmedHandoverCount: z.number().int().nonnegative(),
  confirmedHandoverAmount: MoneyString,

  shiftCount: z.number().int().nonnegative(),
  reconciliationCount: z.number().int().nonnegative(),
  pendingReviewCount: z.number().int().nonnegative(),

  snapshotJson: z.unknown(),

  closedBy: z.string(),
  closedAt: z.string(),
  reopenedBy: z.string().nullable(),
  reopenedAt: z.string().nullable(),
  reopenReason: z.string().nullable(),

  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicDailyClosing = z.infer<typeof PublicDailyClosing>;

export const CreateDailyClosingRequest = z.object({
  businessDate: DateOnly,
});
export type CreateDailyClosingRequest = z.infer<typeof CreateDailyClosingRequest>;

export const ReopenDailyClosingRequest = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type ReopenDailyClosingRequest = z.infer<typeof ReopenDailyClosingRequest>;

export const DailyClosingsListResponse = z.object({
  success: z.literal(true),
  closings: z.array(PublicDailyClosing),
});
export type DailyClosingsListResponse = z.infer<typeof DailyClosingsListResponse>;

export const DailyClosingResponse = z.object({
  success: z.literal(true),
  closing: PublicDailyClosing,
});
export type DailyClosingResponse = z.infer<typeof DailyClosingResponse>;