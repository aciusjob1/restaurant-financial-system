import type { Request, Response } from 'express';
import * as reconciliationService from '../services/reconciliationService.js';
import { ApiError } from '../errors/ApiError.js';
import {
  ListReconciliationsQuerySchema,
  type CreateReconciliationInput,
  type UpdateReconciliationInput,
  type ReviewReconciliationInput,
} from '../validators/reconciliation.js';

export async function listReconciliations(req: Request, res: Response) {
  const parsed = ListReconciliationsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query parameters.');
  }
  const q = parsed.data;
  const reconciliations = await reconciliationService.listReconciliations({
    actor: { id: req.user!.id, role: req.user!.role },
    shiftId: q.shiftId,
    userId: q.userId,
    status: q.status,
  });
  res.json({ success: true, reconciliations });
}

export async function getReconciliation(req: Request, res: Response) {
  const reconciliation = await reconciliationService.getReconciliationById(
    req.params.id,
    { id: req.user!.id, role: req.user!.role }
  );
  res.json({ success: true, reconciliation });
}

export async function createReconciliation(req: Request, res: Response) {
  const input = req.body as CreateReconciliationInput;
  const reconciliation = await reconciliationService.createReconciliation({
    actor: { id: req.user!.id, role: req.user!.role },
    shiftId: input.shiftId,
    actualCash: input.actualCash,
    actualMobile: input.actualMobile,
    notes: input.notes ?? null,
  });
  res.status(201).json({ success: true, reconciliation });
}

export async function updateReconciliation(req: Request, res: Response) {
  const input = req.body as UpdateReconciliationInput;
  const reconciliation = await reconciliationService.updateReconciliation({
    id: req.params.id,
    actor: { id: req.user!.id, role: req.user!.role },
    actualCash: input.actualCash,
    actualMobile: input.actualMobile,
    notes: input.notes,
  });
  res.json({ success: true, reconciliation });
}

export async function submitReconciliation(req: Request, res: Response) {
  const reconciliation = await reconciliationService.submitReconciliation({
    id: req.params.id,
    actor: { id: req.user!.id, role: req.user!.role },
  });
  res.json({ success: true, reconciliation });
}

export async function reviewReconciliation(req: Request, res: Response) {
  const input = req.body as ReviewReconciliationInput;
  const reconciliation = await reconciliationService.reviewReconciliation({
    id: req.params.id,
    actor: { id: req.user!.id, role: req.user!.role },
    decision: input.decision,
    reviewNotes: input.reviewNotes,
  });
  res.json({ success: true, reconciliation });
}