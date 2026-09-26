import { z } from 'zod';

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

export const CreateDailyClosingSchema = z.object({
  businessDate: DateOnly,
});

export const ReopenDailyClosingSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const ListDailyClosingsQuerySchema = z.object({
  businessDate: DateOnly.optional(),
  status: z.enum(['CLOSED', 'SUPERSEDED', 'REOPENED']).optional(),
});

export type CreateDailyClosingInput = z.infer<typeof CreateDailyClosingSchema>;
export type ReopenDailyClosingInput = z.infer<typeof ReopenDailyClosingSchema>;
export type ListDailyClosingsQuery = z.infer<typeof ListDailyClosingsQuerySchema>;