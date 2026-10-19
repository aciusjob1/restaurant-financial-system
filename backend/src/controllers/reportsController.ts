import type { Request, Response } from 'express';
import * as reports from '../services/reportsService.js';

const DEFAULT_LIMIT = 100;
const DEFAULT_OFFSET = 0;

function page(q: Record<string, unknown>): { limit: number; offset: number } {
  const parseNum = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  };

  const rawLimit = parseNum(q.limit);
  const rawOffset = parseNum(q.offset);
  const rawPage = parseNum(q.page);

  const limit = rawLimit !== undefined && rawLimit > 0
    ? Math.min(rawLimit, 1000)
    : DEFAULT_LIMIT;

  let offset = 0;
  if (rawOffset !== undefined && rawOffset >= 0) offset = rawOffset;
  else if (rawPage !== undefined && rawPage >= 1) offset = (rawPage - 1) * limit;

  return { limit, offset };
}

// 1
export async function dailySales(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const range = reports.assertValidRange(q.from as string, q.to as string);
  const { limit, offset } = page(q);
  const result = await reports.dailySalesReport(range, limit, offset);
  res.json({ success: true, ...result });
}

// 2
export async function reconciliations(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const range = reports.assertValidRange(q.from as string, q.to as string);
  const { limit, offset } = page(q);
  const result = await reports.reconciliationSummaryReport(
    range,
    typeof q.userId === 'string' ? q.userId : undefined,
    limit,
    offset
  );
  res.json({ success: true, ...result });
}

// 3
export async function handovers(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const range = reports.assertValidRange(q.from as string, q.to as string);
  const { limit, offset } = page(q);
  const result = await reports.cashHandoverLedgerReport(
    range,
    typeof q.fromUserId === 'string' ? q.fromUserId : undefined,
    typeof q.toUserId === 'string' ? q.toUserId : undefined,
    typeof q.status === 'string' ? q.status : undefined,
    limit,
    offset
  );
  res.json({ success: true, ...result });
}

// 4
export async function expenses(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const range = reports.assertValidRange(q.from as string, q.to as string);
  const { limit, offset } = page(q);
  const result = await reports.expenseReport(
    range,
    typeof q.categoryId === 'string' ? q.categoryId : undefined,
    typeof q.status === 'string' ? (q.status as never) : undefined,
    typeof q.paymentMethod === 'string' ? (q.paymentMethod as never) : undefined,
    limit,
    offset
  );
  res.json({ success: true, ...result });
}

// 5
export async function supplierBalances(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const includeInactive =
    q.includeInactive === 'true' || q.includeInactive === true;
  const result = await reports.supplierBalanceReport(includeInactive);
  res.json({ success: true, ...result });
}

// 6
export async function salesVsPos(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const range = reports.assertValidRange(q.from as string, q.to as string);
  const { limit, offset } = page(q);
  const result = await reports.salesVsPosReport(range, limit, offset);
  res.json({ success: true, ...result });
}

// 7
export async function stockMovements(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const range = reports.assertValidRange(q.from as string, q.to as string);
  const { limit, offset } = page(q);
  const result = await reports.stockMovementsLedgerReport(
    range,
    typeof q.materialId === 'string' ? q.materialId : undefined,
    typeof q.type === 'string' ? (q.type as never) : undefined,
    typeof q.direction === 'string' ? (q.direction as never) : undefined,
    limit,
    offset
  );
  res.json({ success: true, ...result });
}
