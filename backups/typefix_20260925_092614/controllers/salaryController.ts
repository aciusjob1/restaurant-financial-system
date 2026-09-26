import type { Request, Response } from 'express';
import * as salaryService from '../services/salaryService.js';
import { ApiError } from '../errors/ApiError.js';
import {
  ListSalariesQuerySchema,
  ListSalaryPaymentsQuerySchema,
  type CreateSalaryRecordInput,
  type UpdateSalaryRecordInput,
  type CreateSalaryPaymentInput,
  type VoidSalaryPaymentInput,
} from '../validators/salary.js';
import type { PaymentMethod } from '@prisma/client';

// ---------- Salary records ----------

export async function listSalaries(req: Request, res: Response) {
  const parsed = ListSalariesQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query parameters.');
  const q = parsed.data;
  const salaries = await salaryService.listSalaries({
    employeeId: q.employeeId,
    from: q.from,
    to: q.to,
    status: q.status,
    unpaidOnly: q.unpaidOnly,
  });
  res.json({ success: true, salaries });
}

export async function getSalary(req: Request, res: Response) {
  const salary = await salaryService.getSalaryById(req.params.id);
  res.json({ success: true, salary });
}

export async function createSalary(req: Request, res: Response) {
  const input = req.body as CreateSalaryRecordInput;
  const salary = await salaryService.createSalaryRecord({
    actor: { id: req.user!.id, role: req.user!.role },
    employeeId: input.employeeId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    label: input.label,
    baseSalary: input.baseSalary,
    adjustments: input.adjustments,
    deductions: input.deductions,
    notes: input.notes ?? null,
  });
  res.status(201).json({ success: true, salary });
}

export async function updateSalary(req: Request, res: Response) {
  const input = req.body as UpdateSalaryRecordInput;
  const salary = await salaryService.updateSalaryRecord({
    id: req.params.id,
    actor: { id: req.user!.id, role: req.user!.role },
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    label: input.label,
    baseSalary: input.baseSalary,
    adjustments: input.adjustments,
    deductions: input.deductions,
    notes: input.notes,
  });
  res.json({ success: true, salary });
}

export async function approveSalary(req: Request, res: Response) {
  const salary = await salaryService.approveSalaryRecord({
    id: req.params.id,
    actor: { id: req.user!.id, role: req.user!.role },
  });
  res.json({ success: true, salary });
}

// ---------- Salary payments ----------

export async function listSalaryPayments(req: Request, res: Response) {
  const parsed = ListSalaryPaymentsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query parameters.');
  const q = parsed.data;
  const payments = await salaryService.listSalaryPayments({
    salaryRecordId: q.salaryRecordId,
    employeeId: q.employeeId,
    businessDate: q.businessDate,
    from: q.from,
    to: q.to,
    paymentMethod: q.paymentMethod as PaymentMethod | undefined,
    includeVoided: q.includeVoided,
  });
  res.json({ success: true, payments });
}

export async function getSalaryPayment(req: Request, res: Response) {
  const payment = await salaryService.getSalaryPaymentById(req.params.id);
  res.json({ success: true, payment });
}

export async function createSalaryPayment(req: Request, res: Response) {
  const input = req.body as CreateSalaryPaymentInput;
  const result = await salaryService.createSalaryPayment({
    actor: { id: req.user!.id, role: req.user!.role },
    salaryRecordId: input.salaryRecordId,
    amount: input.amount,
    paymentMethod: input.paymentMethod as PaymentMethod,
    businessDate: input.businessDate,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
  });
  res.status(201).json({ success: true, payment: result.payment, salary: result.record });
}

export async function voidSalaryPayment(req: Request, res: Response) {
  const input = req.body as VoidSalaryPaymentInput;
  const result = await salaryService.voidSalaryPayment({
    id: req.params.id,
    actor: { id: req.user!.id, role: req.user!.role },
    reason: input.reason,
  });
  res.json({ success: true, payment: result.payment, salary: result.record });
}