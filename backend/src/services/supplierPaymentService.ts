import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import { parseBusinessDate, toDateOnly } from '../utils/businessDate.js';
import { assertDayNotClosed } from './closedDayGuard.js';
import { nextDocumentNumber } from '../utils/documentNumber.js';
import type { PaymentMethod, Prisma, Role } from '@prisma/client';


async function nextPaymentNumber(tx: Prisma.TransactionClient): Promise<string> {
  return nextDocumentNumber(tx, 'payment');
}

function isSerializationFailure(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2034'
  );
}

function serializePayment(p: {
  id: string;
  paymentNumber: string;
  supplierId: string;
  businessDate: Date;
  amount: Prisma.Decimal;
  paymentMethod: PaymentMethod;
  reference: string | null;
  notes: string | null;
  recordedBy: string;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: p.id,
    paymentNumber: p.paymentNumber,
    supplierId: p.supplierId,
    businessDate: toDateOnly(p.businessDate),
    amount: toMoneyString(p.amount),
    paymentMethod: p.paymentMethod,
    reference: p.reference,
    notes: p.notes,
    recordedBy: p.recordedBy,
    voidedAt: p.voidedAt ? p.voidedAt.toISOString() : null,
    voidedBy: p.voidedBy,
    voidReason: p.voidReason,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function serializeAllocation(a: {
  id: string;
  supplierPaymentId: string;
  purchaseInvoiceId: string;
  amount: Prisma.Decimal;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: a.id,
    supplierPaymentId: a.supplierPaymentId,
    purchaseInvoiceId: a.purchaseInvoiceId,
    amount: toMoneyString(a.amount),
    voidedAt: a.voidedAt ? a.voidedAt.toISOString() : null,
    voidedBy: a.voidedBy,
    voidReason: a.voidReason,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}



async function sumActiveAllocationsForPayment(
  tx: Prisma.TransactionClient,
  supplierPaymentId: string
): Promise<Prisma.Decimal> {
  const rows = await tx.paymentAllocation.findMany({
    where: { supplierPaymentId, voidedAt: null },
    select: { amount: true },
  });
  return rows.reduce((acc, r) => acc.plus(r.amount), toDecimal('0'));
}

async function sumActiveAllocationsForInvoice(
  tx: Prisma.TransactionClient,
  purchaseInvoiceId: string
): Promise<Prisma.Decimal> {
  const rows = await tx.paymentAllocation.findMany({
    where: { purchaseInvoiceId, voidedAt: null },
    select: { amount: true },
  });
  return rows.reduce((acc, r) => acc.plus(r.amount), toDecimal('0'));
}

export async function listPayments(opts: {
  supplierId?: string;
  businessDate?: string;
  from?: string;
  to?: string;
  paymentMethod?: PaymentMethod;
  includeVoided: boolean;
}) {
  const where: Prisma.SupplierPaymentWhereInput = {};
  if (opts.supplierId) where.supplierId = opts.supplierId;
  if (opts.paymentMethod) where.paymentMethod = opts.paymentMethod;
  if (!opts.includeVoided) where.voidedAt = null;

  if (opts.businessDate) {
    where.businessDate = parseBusinessDate(opts.businessDate);
  } else if (opts.from || opts.to) {
    const range: Prisma.DateTimeFilter = {};
    if (opts.from) range.gte = parseBusinessDate(opts.from);
    if (opts.to) range.lte = parseBusinessDate(opts.to);
    where.businessDate = range;
  }

  const rows = await prisma.supplierPayment.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
  });
  return rows.map(serializePayment);
}

export async function getPaymentById(id: string) {
  const row = await prisma.supplierPayment.findUnique({
    where: { id },
    include: { allocations: { orderBy: { createdAt: 'asc' } } },
  });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Supplier payment not found.');
  return {
    payment: serializePayment(row),
    allocations: row.allocations.map(serializeAllocation),
  };
}

export async function createPayment(input: {
  actor: { id: string; role: Role };
  supplierId: string;
  businessDate: string;
  amount: string;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can record supplier payments.');
  }

  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new ApiError(400, 'INVALID_SUPPLIER', 'Supplier does not exist.');

  const businessDate = parseBusinessDate(input.businessDate);
  await assertDayNotClosed(businessDate, input.actor.role);

  const amount = toDecimal(input.amount);

  try {
    const row = await prisma.$transaction(async (tx) => {
      const paymentNumber = await nextPaymentNumber(tx);
      return tx.supplierPayment.create({
        data: {
          paymentNumber,
          supplierId: input.supplierId,
          businessDate,
          amount,
          paymentMethod: input.paymentMethod,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          recordedBy: input.actor.id,
        },
      });
    });
    return serializePayment(row);
  } catch (err) {
    if (isSerializationFailure(err)) {
      throw new ApiError(
        409,
        'CONCURRENT_WRITE',
        'Another payment write is in progress for this supplier; retry the request.'
      );
    }
    throw err;
  }
}

export async function voidPayment(input: {
  id: string;
  actor: { id: string; role: Role };
  reason: string;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can void supplier payments.');
  }

  const existing = await prisma.supplierPayment.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Supplier payment not found.');
  if (existing.voidedAt) {
    throw new ApiError(409, 'ALREADY_VOIDED', 'Payment is already voided.');
  }

  await assertDayNotClosed(existing.businessDate, input.actor.role);

  // Cascade: void all active allocations on this payment, then void the payment.
  const result = await prisma.$transaction(
    async (tx) => {
      const now = new Date();
      await tx.paymentAllocation.updateMany({
        where: { supplierPaymentId: input.id, voidedAt: null },
        data: {
          voidedAt: now,
          voidedBy: input.actor.id,
          voidReason: `Payment voided: ${input.reason}`,
        },
      });
      const payment = await tx.supplierPayment.update({
        where: { id: input.id },
        data: {
          voidedAt: now,
          voidedBy: input.actor.id,
          voidReason: input.reason,
        },
      });
      const allocations = await tx.paymentAllocation.findMany({
        where: { supplierPaymentId: input.id },
        orderBy: { createdAt: 'asc' },
      });
      return { payment, allocations };
    },
    { isolationLevel: 'Serializable' }
  );

  return {
    payment: serializePayment(result.payment),
    allocations: result.allocations.map(serializeAllocation),
  };
}

export async function allocatePayment(input: {
  paymentId: string;
  actor: { id: string; role: Role };
  purchaseInvoiceId: string;
  amount: string;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can allocate payments.');
  }

  const amount = toDecimal(input.amount);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const payment = await tx.supplierPayment.findUnique({
          where: { id: input.paymentId },
        });
        if (!payment) throw new ApiError(404, 'PAYMENT_NOT_FOUND', 'Supplier payment not found.');
        if (payment.voidedAt) {
          throw new ApiError(409, 'PAYMENT_VOIDED', 'Cannot allocate against a voided payment.');
        }

        const invoice = await tx.purchaseInvoice.findUnique({
          where: { id: input.purchaseInvoiceId },
        });
        if (!invoice) throw new ApiError(404, 'INVOICE_NOT_FOUND', 'Purchase invoice not found.');
        if (invoice.status !== 'POSTED') {
          throw new ApiError(
            409,
            'INVOICE_NOT_POSTED',
            `Only POSTED invoices can receive allocations (currently ${invoice.status}).`
          );
        }
        if (invoice.supplierId !== payment.supplierId) {
          throw new ApiError(
            409,
            'SUPPLIER_MISMATCH',
            'Invoice and payment belong to different suppliers.'
          );
        }

        // Payment capacity
        const alreadyAllocated = await sumActiveAllocationsForPayment(tx, payment.id);
        const remainingOnPayment = payment.amount.minus(alreadyAllocated);
        if (amount.greaterThan(remainingOnPayment)) {
          throw new ApiError(
            409,
            'PAYMENT_OVERALLOCATED',
            'This allocation would exceed the payment amount.',
            {
              paymentAmount: toMoneyString(payment.amount),
              alreadyAllocated: toMoneyString(alreadyAllocated),
              attempted: toMoneyString(amount),
            }
          );
        }

        // Invoice capacity
        const alreadyPaidOnInvoice = await sumActiveAllocationsForInvoice(tx, invoice.id);
        const remainingOnInvoice = invoice.total.minus(alreadyPaidOnInvoice);
        if (amount.greaterThan(remainingOnInvoice)) {
          throw new ApiError(
            409,
            'INVOICE_OVERALLOCATED',
            'This allocation would exceed the invoice remaining balance.',
            {
              invoiceTotal: toMoneyString(invoice.total),
              alreadyPaid: toMoneyString(alreadyPaidOnInvoice),
              attempted: toMoneyString(amount),
            }
          );
        }

        // Check existing active allocation row for this (payment, invoice) pair.
        // If one exists (and is not voided), we top it up rather than violate the
        // unique constraint.
        const existing = await tx.paymentAllocation.findFirst({
          where: {
            supplierPaymentId: payment.id,
            purchaseInvoiceId: invoice.id,
            voidedAt: null,
          },
        });

        let allocationRow;
        if (existing) {
          allocationRow = await tx.paymentAllocation.update({
            where: { id: existing.id },
            data: { amount: existing.amount.plus(amount) },
          });
        } else {
          // The unique constraint is on (supplierPaymentId, purchaseInvoiceId)
          // regardless of voided state. If a voided row exists for this pair,
          // resurrect it with a new amount and clear the void fields.
          const voidedRow = await tx.paymentAllocation.findUnique({
            where: {
              supplierPaymentId_purchaseInvoiceId: {
                supplierPaymentId: payment.id,
                purchaseInvoiceId: invoice.id,
              },
            },
          });
          if (voidedRow) {
            allocationRow = await tx.paymentAllocation.update({
              where: { id: voidedRow.id },
              data: {
                amount,
                voidedAt: null,
                voidedBy: null,
                voidReason: null,
              },
            });
          } else {
            allocationRow = await tx.paymentAllocation.create({
              data: {
                supplierPaymentId: payment.id,
                purchaseInvoiceId: invoice.id,
                amount,
              },
            });
          }
        }

        return { allocation: allocationRow };
      },
      { isolationLevel: 'Serializable' }
    );

    return { allocation: serializeAllocation(result.allocation) };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (isSerializationFailure(err)) {
      throw new ApiError(
        409,
        'CONCURRENT_WRITE',
        'Another allocation is in progress for this payment or invoice; retry the request.'
      );
    }
    throw err;
  }
}

export async function voidAllocation(input: {
  id: string;
  actor: { id: string; role: Role };
  reason: string;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can void allocations.');
  }

  const existing = await prisma.paymentAllocation.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Allocation not found.');
  if (existing.voidedAt) {
    throw new ApiError(409, 'ALREADY_VOIDED', 'Allocation is already voided.');
  }

  const row = await prisma.paymentAllocation.update({
    where: { id: input.id },
    data: {
      voidedAt: new Date(),
      voidedBy: input.actor.id,
      voidReason: input.reason,
    },
  });
  return serializeAllocation(row);
}

export async function completePayment(input: {
  actor: { id: string; role: Role };
  supplierId: string;
  businessDate: string;
  amount: string;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  autoAllocate?: boolean;
  allocateTo?: string[];
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can record supplier payments.');
  }

  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new ApiError(400, 'INVALID_SUPPLIER', 'Supplier does not exist.');

  const businessDate = parseBusinessDate(input.businessDate);
  await assertDayNotClosed(businessDate, input.actor.role);

  const amount = toDecimal(input.amount);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const paymentNumber = await nextPaymentNumber(tx);
        const payment = await tx.supplierPayment.create({
          data: {
            paymentNumber,
            supplierId: input.supplierId,
            businessDate,
            amount,
            paymentMethod: input.paymentMethod,
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            recordedBy: input.actor.id,
          },
        });

        // Determine target invoices.
        let targets: string[] = [];
        if (input.allocateTo && input.allocateTo.length > 0) {
          targets = input.allocateTo;
        } else if (input.autoAllocate) {
          const all = await tx.purchaseInvoice.findMany({
            where: { supplierId: input.supplierId, status: 'POSTED' },
            orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
          });
          if (all.length > 0) {
            const activeAllocs = await tx.paymentAllocation.findMany({
              where: {
                purchaseInvoiceId: { in: all.map((i) => i.id) },
                voidedAt: null,
              },
              select: { purchaseInvoiceId: true, amount: true },
            });
            const paidByInvoice = new Map<string, Prisma.Decimal>();
            for (const a of activeAllocs) {
              const cur = paidByInvoice.get(a.purchaseInvoiceId) ?? toDecimal('0');
              paidByInvoice.set(a.purchaseInvoiceId, cur.plus(a.amount));
            }
            targets = all
              .filter((inv) => {
                const paid = paidByInvoice.get(inv.id) ?? toDecimal('0');
                return paid.lessThan(inv.total);
              })
              .map((inv) => inv.id);
          }
        }

        let remaining = amount;
        const createdAllocations: Array<{
          id: string;
          supplierPaymentId: string;
          purchaseInvoiceId: string;
          amount: Prisma.Decimal;
          voidedAt: Date | null;
          voidedBy: string | null;
          voidReason: string | null;
          createdAt: Date;
          updatedAt: Date;
        }> = [];

        for (const invId of targets) {
          if (remaining.lessThanOrEqualTo(0)) break;
          const invoice = await tx.purchaseInvoice.findUnique({ where: { id: invId } });
          if (!invoice) continue;
          if (invoice.status !== 'POSTED') continue;
          if (invoice.supplierId !== input.supplierId) continue;

          const alreadyPaid = await sumActiveAllocationsForInvoice(tx, invId);
          const invoiceRemaining = invoice.total.minus(alreadyPaid);
          if (invoiceRemaining.lessThanOrEqualTo(0)) continue;

          const toAllocate = remaining.lessThan(invoiceRemaining) ? remaining : invoiceRemaining;

          const existing = await tx.paymentAllocation.findFirst({
            where: {
              supplierPaymentId: payment.id,
              purchaseInvoiceId: invId,
              voidedAt: null,
            },
          });
          let allocationRow;
          if (existing) {
            allocationRow = await tx.paymentAllocation.update({
              where: { id: existing.id },
              data: { amount: existing.amount.plus(toAllocate) },
            });
          } else {
            const voidedRow = await tx.paymentAllocation.findUnique({
              where: {
                supplierPaymentId_purchaseInvoiceId: {
                  supplierPaymentId: payment.id,
                  purchaseInvoiceId: invId,
                },
              },
            });
            if (voidedRow) {
              allocationRow = await tx.paymentAllocation.update({
                where: { id: voidedRow.id },
                data: {
                  amount: toAllocate,
                  voidedAt: null,
                  voidedBy: null,
                  voidReason: null,
                },
              });
            } else {
              allocationRow = await tx.paymentAllocation.create({
                data: {
                  supplierPaymentId: payment.id,
                  purchaseInvoiceId: invId,
                  amount: toAllocate,
                },
              });
            }
          }
          createdAllocations.push(allocationRow);
          remaining = remaining.minus(toAllocate);
        }

        return { payment, allocations: createdAllocations };
      },
      { isolationLevel: 'Serializable' }
    );

    return {
      payment: serializePayment(result.payment),
      allocations: result.allocations.map(serializeAllocation),
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (isSerializationFailure(err)) {
      throw new ApiError(
        409,
        'CONCURRENT_WRITE',
        'Another payment or allocation write is in progress for this supplier; retry the request.'
      );
    }
    throw err;
  }
}
