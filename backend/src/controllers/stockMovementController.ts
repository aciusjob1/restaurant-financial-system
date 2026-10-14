import type { Request, Response } from 'express';
import * as service from '../services/stockMovementService.js';
import type { CreateStockMovementInput } from '../validators/stockMovement.js';
import type { StockMovementType, StockMovementDirection } from '@prisma/client';

export async function create(req: Request, res: Response) {
  const input = req.body as CreateStockMovementInput;
  const movement = await service.createManualMovement({
    actor: { id: req.user!.id, role: req.user!.role },
    materialId: input.materialId,
    type: input.type,
    direction: input.direction,
    businessDate: input.businessDate,
    quantity: input.quantity,
    unitCost: input.unitCost ?? null,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
  });
  res.status(201).json({ success: true, movement });
}

export async function list(req: Request, res: Response) {
  const q = req.query as Record<string, string | undefined>;
  const limit = q.limit ? Number(q.limit) : undefined;
  const movements = await service.listMovements({
    materialId: q.materialId,
    type: q.type as StockMovementType | undefined,
    direction: q.direction as StockMovementDirection | undefined,
    from: q.from,
    to: q.to,
    limit,
  });
  res.json({ success: true, movements });
}

export async function getOne(req: Request, res: Response) {
  const movement = await service.getMovementById(req.params.id!);
  res.json({ success: true, movement });
}

export async function materialStock(req: Request, res: Response) {
  const summary = await service.getMaterialStock(req.params.id!);
  res.json({ success: true, ...summary });
}

export async function valuation(_req: Request, res: Response) {
  const result = await service.getStockValuation();
  res.json({ success: true, ...result });
}

export async function usage(req: Request, res: Response) {
  // validateQuery has already coerced and defaulted `period`; a missing
  // `date` means "today" and the service clamps a future anchor. The
  // controller mirrors the defaults anyway so it does not depend on
  // middleware behavior for correctness.
  const q = req.query as Record<string, string | undefined>;
  const result = await service.getStockUsage({
    period: (q.period as 'daily' | 'weekly' | 'monthly') ?? 'daily',
    anchorDate: q.date ?? new Date().toISOString().slice(0, 10),
    materialId: q.materialId,
  });
  res.json({ success: true, ...result });
}
