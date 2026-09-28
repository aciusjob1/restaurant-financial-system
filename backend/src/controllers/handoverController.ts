import type { Request, Response } from 'express';
import * as handoverService from '../services/handoverService.js';
import { ApiError } from '../errors/ApiError.js';
import {
  ListCashHandoversQuerySchema,
  type CreateCashHandoverInput,
  type ConfirmCashHandoverInput,
  type VoidCashHandoverInput,
} from '../validators/handover.js';

export async function listHandovers(req: Request, res: Response) {
  const parsed = ListCashHandoversQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query parameters.');
  }
  const q = parsed.data;
  const handovers = await handoverService.listHandovers({
    actor: { id: req.user!.id, role: req.user!.role },
    shiftId: q.shiftId,
    reconciliationId: q.reconciliationId,
    fromUserId: q.fromUserId,
    toUserId: q.toUserId,
    status: q.status,
    includeVoided: q.includeVoided,
  });
  res.json({ success: true, handovers });
}

export async function getHandover(req: Request, res: Response) {
  const handover = await handoverService.getHandoverById(req.params.id!, {
    id: req.user!.id,
    role: req.user!.role,
  });
  res.json({ success: true, handover });
}

export async function createHandover(req: Request, res: Response) {
  const input = req.body as CreateCashHandoverInput;
  const handover = await handoverService.createHandover({
    actor: { id: req.user!.id, role: req.user!.role },
    shiftId: input.shiftId,
    amount: input.amount,
    toUserId: input.toUserId,
    notes: input.notes ?? null,
    onBehalfOfUserId: input.onBehalfOfUserId ?? null,
  });
  res.status(201).json({ success: true, handover });
}

export async function confirmHandover(req: Request, res: Response) {
  const input = req.body as ConfirmCashHandoverInput;
  const handover = await handoverService.confirmHandover({
    id: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role },
    confirmedNotes: input.confirmedNotes,
  });
  res.json({ success: true, handover });
}

export async function voidHandover(req: Request, res: Response) {
  const input = req.body as VoidCashHandoverInput;
  const handover = await handoverService.voidHandover({
    id: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role },
    reason: input.reason,
  });
  res.json({ success: true, handover });
}

export async function listReceivableUsers(_req: Request, res: Response) {
  const users = await handoverService.listReceivableUsers();
  res.json({ success: true, users });
}