import type { Request, Response } from 'express';
import * as salesService from '../services/salesService.js';
import { ApiError } from '../errors/ApiError.js';
import type {
  ManualSalesSummaryInput,
  ListSalesSummariesQuery,
  MySummaryQuery,
  WaiterReportInput,
  WaiterCollectionsInput,
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

  // Duplicate guard (Model B): if a MANUAL summary already exists for this
  // waiter + date + sourceReference, require an explicit overwrite flag
  // rather than silently replacing the manager's previous entry.
  if (!input.overwrite) {
    const existing = await salesService.findExistingManualSummary({
      businessDate: input.businessDate,
      userId: input.userId ?? null,
      sourceReference: input.sourceReference ?? '',
    });
    if (existing) {
      throw new ApiError(
        409,
        'SUMMARY_EXISTS',
        'A sales summary already exists for this waiter and date.',
        {
          existing: {
            id: existing.id,
            totalSales: existing.totalSales.toString(),
            createdAt: existing.createdAt.toISOString(),
          },
        }
      );
    }
  }

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
  // Managers and owners may fetch another user's summary by passing
  // userId. Waiters always get their own row regardless of what they
  // pass, so this cannot be used to escalate.
  const targetUserId =
    q.userId && (req.user!.role === 'MANAGER' || req.user!.role === 'OWNER')
      ? q.userId
      : req.user!.id;
  const result = await salesService.listMySummary(targetUserId, businessDate);
  res.json({
    success: true,
    ...(result ?? { summary: null, activeExpenses: [], mpesaEntries: [] }),
  });
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

/**
 * Waiter (or manager on a waiter's behalf) submits the day's actual money
 * movements: M-Pesa collections keyed by payer name, and expenses.
 *
 * Response includes the persisted summary (unchanged by this endpoint),
 * the newly created collections, and the actor's currently-active DAILY
 * expenses after supersession.
 */
export async function submitWaiterCollections(req: Request, res: Response) {
  const body = req.body as WaiterCollectionsInput;
  const result = await salesService.submitWaiterCollections({
    summaryId: req.params.id!,
    actorId: req.user!.id,
    actorRole: req.user!.role,
    mpesaEntries: body.mpesaEntries,
    expenses: body.expenses,
  });
  res.status(200).json({ success: true, ...result });
}
