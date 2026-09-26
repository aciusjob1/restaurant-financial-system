import type { Request, Response } from 'express';
import * as closingService from '../services/closingService.js';
import { ApiError } from '../errors/ApiError.js';
import {
  ListDailyClosingsQuerySchema,
  type CreateDailyClosingInput,
  type ReopenDailyClosingInput,
} from '../validators/closing.js';

export async function listClosings(req: Request, res: Response) {
  const parsed = ListDailyClosingsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query parameters.');
  }
  const q = parsed.data;
  const closings = await closingService.listClosings({
    businessDate: q.businessDate,
    status: q.status,
  });
  res.json({ success: true, closings });
}

export async function getClosing(req: Request, res: Response) {
  const closing = await closingService.getClosingById(req.params.id!);
  res.json({ success: true, closing });
}

export async function createClosing(req: Request, res: Response) {
  const input = req.body as CreateDailyClosingInput;
  const closing = await closingService.createClosing({
    businessDate: input.businessDate,
    actorId: req.user!.id,
  });
  res.status(201).json({ success: true, closing });
}

export async function reopenClosing(req: Request, res: Response) {
  const input = req.body as ReopenDailyClosingInput;
  const closing = await closingService.reopenClosing({
    id: req.params.id!,
    actorId: req.user!.id,
    reason: input.reason,
  });
  res.json({ success: true, closing });
}