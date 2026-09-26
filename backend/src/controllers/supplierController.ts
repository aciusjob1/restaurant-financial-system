import type { Request, Response } from 'express';
import * as supplierService from '../services/supplierService.js';
import * as invoiceService from '../services/purchaseInvoiceService.js';
import * as paymentService from '../services/supplierPaymentService.js';
import { ApiError } from '../errors/ApiError.js';
import {
  ListSuppliersQuerySchema,
  ListPurchaseInvoicesQuerySchema,
  ListSupplierPaymentsQuerySchema,
  type CreateSupplierInput,
  type UpdateSupplierInput,
  type CreatePurchaseInvoiceInput,
  type UpdatePurchaseInvoiceInput,
  type CancelPurchaseInvoiceInput,
  type CreateSupplierPaymentInput,
  type VoidSupplierPaymentInput,
  type AllocatePaymentInput,
  type VoidAllocationInput,
} from '../validators/supplier.js';
import type { PaymentMethod } from '@prisma/client';

// ---------- Suppliers ----------

export async function listSuppliers(req: Request, res: Response) {
  const parsed = ListSuppliersQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query parameters.');
  const q = parsed.data;
  const suppliers = await supplierService.listSuppliers({
    includeInactive: q.includeInactive,
    search: q.search,
  });
  res.json({ success: true, suppliers });
}

export async function getSupplier(req: Request, res: Response) {
  const supplier = await supplierService.getSupplierById(req.params.id!);
  res.json({ success: true, supplier });
}

export async function createSupplier(req: Request, res: Response) {
  const input = req.body as CreateSupplierInput;
  const supplier = await supplierService.createSupplier({
    actor: { id: req.user!.id, role: req.user!.role },
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    contactPerson: input.contactPerson ?? null,
    tin: input.tin ?? null,
    paymentTerms: input.paymentTerms ?? null,
    notes: input.notes ?? null,
  });
  res.status(201).json({ success: true, supplier });
}

export async function updateSupplier(req: Request, res: Response) {
  const input = req.body as UpdateSupplierInput;
  const supplier = await supplierService.updateSupplier(
    req.params.id!,
    { id: req.user!.id, role: req.user!.role },
    {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.contactPerson !== undefined ? { contactPerson: input.contactPerson } : {}),
      ...(input.tin !== undefined ? { tin: input.tin } : {}),
      ...(input.paymentTerms !== undefined ? { paymentTerms: input.paymentTerms } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    }
  );
  res.json({ success: true, supplier });
}

export async function getSupplierBalance(req: Request, res: Response) {
  const balance = await supplierService.getSupplierBalance(req.params.id!);
  res.json({ success: true, ...balance });
}

// ---------- Purchase invoices ----------

export async function listInvoices(req: Request, res: Response) {
  const parsed = ListPurchaseInvoicesQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query parameters.');
  const q = parsed.data;
  const invoices = await invoiceService.listInvoices({
    supplierId: q.supplierId,
    businessDate: q.businessDate,
    from: q.from,
    to: q.to,
    status: q.status,
    unpaidOnly: q.unpaidOnly,
  });
  res.json({ success: true, invoices });
}

export async function getInvoice(req: Request, res: Response) {
  const result = await invoiceService.getInvoiceById(req.params.id!);
  res.json({ success: true, invoice: result, items: result.items });
}

export async function createInvoice(req: Request, res: Response) {
  const input = req.body as CreatePurchaseInvoiceInput;
  const invoice = await invoiceService.createInvoice({
    actor: { id: req.user!.id, role: req.user!.role },
    supplierId: input.supplierId,
    invoiceNumber: input.invoiceNumber,
    date: input.date,
    businessDate: input.businessDate,
    total: input.total,
    notes: input.notes ?? null,
  });
  res.status(201).json({ success: true, invoice });
}

export async function updateInvoice(req: Request, res: Response) {
  const input = req.body as UpdatePurchaseInvoiceInput;
  const invoice = await invoiceService.updateInvoice({
    id: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role },
    invoiceNumber: input.invoiceNumber,
    date: input.date,
    businessDate: input.businessDate,
    total: input.total,
    notes: input.notes,
  });
  res.json({ success: true, invoice });
}

export async function deleteDraftInvoice(req: Request, res: Response) {
  await invoiceService.deleteDraftInvoice({
    id: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role },
  });
  res.json({ success: true });
}

export async function postInvoice(req: Request, res: Response) {
  const invoice = await invoiceService.postInvoice({
    id: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role },
  });
  res.json({ success: true, invoice });
}

export async function cancelInvoice(req: Request, res: Response) {
  const input = req.body as CancelPurchaseInvoiceInput;
  const invoice = await invoiceService.cancelInvoice({
    id: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role },
    reason: input.reason,
  });
  res.json({ success: true, invoice });
}

// ---------- Payments ----------

export async function listPayments(req: Request, res: Response) {
  const parsed = ListSupplierPaymentsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query parameters.');
  const q = parsed.data;
  const payments = await paymentService.listPayments({
    supplierId: q.supplierId,
    businessDate: q.businessDate,
    from: q.from,
    to: q.to,
    paymentMethod: q.paymentMethod as PaymentMethod | undefined,
    includeVoided: q.includeVoided,
  });
  res.json({ success: true, payments });
}

export async function getPayment(req: Request, res: Response) {
  const result = await paymentService.getPaymentById(req.params.id!);
  res.json({ success: true, payment: result.payment, allocations: result.allocations });
}

export async function createPayment(req: Request, res: Response) {
  const input = req.body as CreateSupplierPaymentInput;
  const payment = await paymentService.createPayment({
    actor: { id: req.user!.id, role: req.user!.role },
    supplierId: input.supplierId,
    businessDate: input.businessDate,
    amount: input.amount,
    paymentMethod: input.paymentMethod as PaymentMethod,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
  });
  res.status(201).json({ success: true, payment });
}

export async function voidPayment(req: Request, res: Response) {
  const input = req.body as VoidSupplierPaymentInput;
  const result = await paymentService.voidPayment({
    id: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role },
    reason: input.reason,
  });
  res.json({ success: true, payment: result.payment, allocations: result.allocations });
}

export async function allocatePayment(req: Request, res: Response) {
  const input = req.body as AllocatePaymentInput;
  const result = await paymentService.allocatePayment({
    paymentId: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role },
    purchaseInvoiceId: input.purchaseInvoiceId,
    amount: input.amount,
  });
  res.status(201).json({ success: true, allocation: result.allocation });
}

export async function voidAllocation(req: Request, res: Response) {
  const input = req.body as VoidAllocationInput;
  const allocation = await paymentService.voidAllocation({
    id: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role },
    reason: input.reason,
  });
  res.json({ success: true, allocation });
}