import type { Request, Response } from 'express';
import * as salesService from '../services/salesService.js';
import { ApiError } from '../errors/ApiError.js';
import type {
  ManualSalesSummaryInput,
  ListSalesSummariesQuery,
} from '../validators/sales.js';
import type { PaymentMethod } from '@prisma/client';

export async function listSummaries(req: Request, res: Response) {
  const q = req.query as ListSalesSummariesQuery;
  const summaries = await salesService.listSummaries({
    businessDate: q.businessDate,
    source: q.source,
  });
  res.json({ success: true, summaries });
}

export async function getSummary(req: Request, res: Response) {
  const summary = await salesService.getSummaryById(req.params.id);
  res.json({ success: true, summary });
}

export async function createManualSummary(req: Request, res: Response) {
  const input = req.body as ManualSalesSummaryInput;
  const summary = await salesService.createManualSummary({
    businessDate: input.businessDate,
    sourceReference: input.sourceReference ?? '',
    notes: input.notes ?? null,
    lines: input.lines.map((l) => ({
      paymentMethod: l.paymentMethod as PaymentMethod,
      amount: l.amount,
      notes: l.notes ?? null,
    })),
    enteredBy: req.user!.id,
  });
  res.status(201).json({ success: true, summary });
}

export async function importCsv(req: Request, res: Response) {
  if (!req.file) {
    throw new ApiError(400, 'NO_FILE', 'No file uploaded.');
  }
  // multer's memoryStorage puts the file body on req.file.buffer.
  const csv = req.file.buffer.toString('utf8');
  const result = await salesService.importFromCsv({
    csv,
    enteredBy: req.user!.id,
  });
  res.status(201).json({
    success: true,
    imported: result.imported,
    updated: result.updated,
    summaries: result.summaries,
  });
}