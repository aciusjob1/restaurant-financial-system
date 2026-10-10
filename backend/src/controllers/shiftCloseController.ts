import type { Request, Response } from 'express';
import * as service from '../services/shiftCloseService.js';
import type { CloseMoneyInput, CompleteShiftInput, SubmitShiftInput } from '../validators/shiftClose.js';
import type { PaymentMethod, Role } from '@prisma/client';

export async function closeMoney(req: Request, res: Response) {
  const input = req.body as CloseMoneyInput;
  const result = await service.closeMoney({
    actor: { id: req.user!.id, role: req.user!.role as Role },
    shiftId: req.params.id!,
    mpesaEntries: (input.mpesaEntries ?? []).map((m) => ({
      payerName: m.payerName,
      amount: m.amount,
    })),
    expenses: (input.expenses ?? []).map((e) => ({
      categoryId: e.categoryId,
      amount: e.amount,
      paymentMethod: e.paymentMethod as PaymentMethod,
      description: e.description,
      notes: e.notes ?? null,
      paidByUserId: e.paidByUserId ?? null,
    })),
    receivedByUserId: input.receivedByUserId,
    notes: input.notes ?? null,
  });
  res.status(201).json({ success: true, ...result });
}

export async function completeShift(req: Request, res: Response) {
  const input = req.body as CompleteShiftInput;
  const result = await service.completeShift({
    actor: { id: req.user!.id, role: req.user!.role as Role },
    shiftId: req.params.id!,
    expenses: (input.expenses ?? []).map((e) => ({
      categoryId: e.categoryId,
      amount: e.amount,
      paymentMethod: e.paymentMethod as PaymentMethod,
      description: e.description,
      notes: e.notes ?? null,
      paidByUserId: e.paidByUserId ?? null,
    })),
    cashHandedOver: input.cashHandedOver,
    receivedByUserId: input.receivedByUserId,
    notes: input.notes ?? null,
  });
  res.status(201).json({ success: true, ...result });
}

export async function submitShift(req: Request, res: Response) {
  const input = req.body as SubmitShiftInput;
  const result = await service.submitShift({
    actor: { id: req.user!.id, role: req.user!.role as Role },
    shiftId: req.params.id!,
    mpesaEntries: (input.mpesaEntries ?? []).map((m) => ({
      payerName: m.payerName,
      amount: m.amount,
    })),
    expenses: (input.expenses ?? []).map((e) => ({
      categoryId: e.categoryId,
      amount: e.amount,
      paymentMethod: e.paymentMethod as PaymentMethod,
      description: e.description,
      notes: e.notes ?? null,
      paidByUserId: e.paidByUserId ?? null,
    })),
    receivedByUserId: input.receivedByUserId,
    notes: input.notes ?? null,
  });
  res.status(201).json({ success: true, ...result });
}

export async function finalizeShift(req: Request, res: Response) {
  const result = await service.finalizeShift({
    actor: { id: req.user!.id, role: req.user!.role as Role },
    shiftId: req.params.id!,
  });
  res.json({ success: true, ...result });
}