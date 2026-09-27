import type { Request, Response } from 'express';
import * as shiftService from '../services/shiftService.js';
import type {
  StartShiftInput,
  TransitionShiftInput,
  SetOpeningCashInput,
  ListShiftsQuery,
} from '../validators/shift.js';

export async function listShifts(req: Request, res: Response) {
  const q = req.query as ListShiftsQuery;
  const shifts = await shiftService.listShifts({
    actor: { id: req.user!.id, role: req.user!.role },
    userId: q.userId,
    status: q.status,
    businessDate: q.businessDate,
  });
  res.json({ success: true, shifts });
}

export async function getShift(req: Request, res: Response) {
  const shift = await shiftService.getShiftById(req.params.id!, {
    id: req.user!.id,
    role: req.user!.role,
  });
  res.json({ success: true, shift });
}

export async function startShift(req: Request, res: Response) {
  const input = req.body as StartShiftInput;
  const shift = await shiftService.startShift({
    actor: { id: req.user!.id, role: req.user!.role },
    businessDate: input.businessDate,
    openingCash: input.openingCash,
    notes: input.notes ?? null,
  });
  res.status(201).json({ success: true, shift });
}

export async function transitionShift(req: Request, res: Response) {
  const input = req.body as TransitionShiftInput;
  const shift = await shiftService.transitionShift({
    shiftId: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role },
    to: input.to,
    reason: input.reason,
  });
  res.json({ success: true, shift });
}

export async function setOpeningCash(req: Request, res: Response) {
  const input = req.body as SetOpeningCashInput;
  const shift = await shiftService.setOpeningCash({
    id: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role },
    openingCash: input.openingCash,
  });
  res.json({ success: true, shift });
}
