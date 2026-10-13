import type { Request, Response } from 'express';
import * as service from '../services/dailyCashReceiptService.js';
import { ApiError } from '../errors/ApiError.js';
import { ListQuerySchema, type UpsertReceiptInput } from '../validators/dailyCashReceipt.js';

export async function list(req: Request, res: Response) {
  const parsed = ListQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query parameters.');
  const rows = await service.listForDate(parsed.data.businessDate);
  res.json({ success: true, rows });
}

export async function upsert(req: Request, res: Response) {
  const body = req.body as UpsertReceiptInput;
  const receipt = await service.upsertReceipt({
    userId: body.userId,
    businessDate: body.businessDate,
    status: body.status,
    amountReceived: body.amountReceived ?? null,
    actorId: req.user!.id,
    expectedUpdatedAt: body.expectedUpdatedAt,
  });
  res.status(200).json({ success: true, receipt });
}

export async function getMine(req: Request, res: Response) {
  const parsed = ListQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query parameters.');
  const receipt = await service.getMyReceiptForDate(req.user!.id, parsed.data.businessDate);
  res.json({ success: true, receipt });
}
