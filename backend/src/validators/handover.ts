import { z } from 'zod';

export const CreateCashHandoverSchema = z.object({
  reconciliationId: z.string().min(1),
  toUserId: z.string().min(1),
  notes: z.string().trim().max(500).nullable().optional(),
  // MANAGER/OWNER only: attribute this handover to a specific waiter.
  // WAITER must omit or set to own id.
  onBehalfOfUserId: z.string().min(1).nullable().optional(),
});

export const ConfirmCashHandoverSchema = z.object({
  confirmedNotes: z.string().trim().max(500).optional(),
});

export const ListCashHandoversQuerySchema = z.object({
  reconciliationId: z.string().min(1).optional(),
  fromUserId: z.string().min(1).optional(),
  toUserId: z.string().min(1).optional(),
  status: z.enum(['PENDING', 'CONFIRMED']).optional(),
});

export type CreateCashHandoverInput = z.infer<typeof CreateCashHandoverSchema>;
export type ConfirmCashHandoverInput = z.infer<typeof ConfirmCashHandoverSchema>;
export type ListCashHandoversQuery = z.infer<typeof ListCashHandoversQuerySchema>;