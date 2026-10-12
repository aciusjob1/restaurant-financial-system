import type { Request, Response } from 'express';
import * as salesService from '../services/salesService.js';
import { ApiError } from '../errors/ApiError.js';
import type {
  ManualSalesSummaryInput,
  ListSalesSummariesQuery,
  MySummaryQuery,
  WaiterReportInput,
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
  const summary = await salesService.getSummaryById(req.params.id!);
  res.json({ success: true, summary });
}

export async function createManualSummary(req: Request, res: Response) {
  const input = req.body as ManualSalesSummaryInput;
  const summary = await salesService.createManualSummary({
    businessDate: input.businessDate,
    sourceReference: input.sourceReference ?? '',
    userId: input.userId ?? null,
    notes: input.notes ?? null,
    lines: input.lines.map((l) => ({
      paymentMethod: l.paymentMethod as PaymentMethod,
      amount: l.amount,
      notes: l.notes ?? null,
    })),
    totalSales: input.totalSales,
    expenseRows: input.expenseRows,
    enteredBy: req.user!.id,
    actorRole: req.user!.role,
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

export async function getMySummary(req: Request, res: Response) {
  const q = req.query as MySummaryQuery;
  const businessDate = q.businessDate ?? new Date().toISOString().slice(0, 10);
  const result = await salesService.listMySummary(req.user!.id, businessDate);
  res.json({ success: true, ...(result ?? { summary: null, activeExpenses: [] }) });
}

export async function submitWaiterReport(req: Request, res: Response) {
  const body = req.body as WaiterReportInput;
  const summary = await salesService.submitWaiterReport({
    summaryId: req.params.id!,
    actorId: req.user!.id,
    actorRole: req.user!.role,
    mpesaRows: body.mpesaRows,
    expenseRows: body.expenseRows,
  });
  res.status(200).json({ success: true, summary });
}
