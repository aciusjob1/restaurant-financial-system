import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import { parseBusinessDate, toDateOnly } from '../utils/businessDate.js';
import { assertDayNotClosed } from './closedDayGuard.js';
import { createPurchaseMovementsFromItems, reversePurchaseMovementsForInvoice } from './stockMovementService.js';
import type { PurchaseInvoiceStatus, Prisma, Role } from '@prisma/client';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}

function serialize(i: {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  date: Date;
  businessDate: Date;
  subtotal: Prisma.Decimal;
  total: Prisma.Decimal;
  status: PurchaseInvoiceStatus;
  notes: string | null;
  createdBy: string;
  postedBy: string | null;
  postedAt: Date | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    supplierId: i.supplierId,
    date: toDateOnly(i.date),
    businessDate: toDateOnly(i.businessDate),
    subtotal: toMoneyString(i.subtotal),
    total: toMoneyString(i.total),
    status: i.status,
    notes: i.notes,
    createdBy: i.createdBy,
    postedBy: i.postedBy,
    postedAt: i.postedAt ? i.postedAt.toISOString() : null,
    cancelledBy: i.cancelledBy,
    cancelledAt: i.cancelledAt ? i.cancelledAt.toISOString() : null,
    cancelReason: i.cancelReason,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

function serializeItem(i: {
  id: string;
  purchaseInvoiceId: string;
  materialId: string | null;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  total: Prisma.Decimal;
  notes: string | null;
  createdAt: Date;
}) {
  return {
    id: i.id,
    purchaseInvoiceId: i.purchaseInvoiceId,
    materialId: i.materialId,
    quantity: i.quantity.toFixed(3),
    unitPrice: toMoneyString(i.unitPrice),
    total: toMoneyString(i.total),
    notes: i.notes,
    createdAt: i.createdAt.toISOString(),
  };
}

export async function listInvoices(opts: {
  supplierId?: string;
  businessDate?: string;
  from?: string;
  to?: string;
  status?: PurchaseInvoiceStatus;
  unpaidOnly: boolean;
}) {
  const where: Prisma.PurchaseInvoiceWhereInput = {};
  if (opts.supplierId) where.supplierId = opts.supplierId;
  if (opts.status) where.status = opts.status;

  if (opts.businessDate) {
    where.businessDate = parseBusinessDate(opts.businessDate);
  } else if (opts.from || opts.to) {
    const range: Prisma.DateTimeFilter = {};
    if (opts.from) range.gte = parseBusinessDate(opts.from);
    if (opts.to) range.lte = parseBusinessDate(opts.to);
    where.businessDate = range;
  }

  const rows = await prisma.purchaseInvoice.findMany({
    where,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      allocations: { where: { voidedAt: null }, select: { amount: true } },
    },
  });

  const withPaid = rows.map((r) => {
    const paid = r.allocations.reduce((acc, a) => acc.plus(a.amount), toDecimal('0'));
    const isFullyPaid = paid.greaterThanOrEqualTo(r.total);
    return { row: r, paid, isFullyPaid };
  });

  const filtered = opts.unpaidOnly
    ? withPaid.filter((x) => x.row.status === 'POSTED' && !x.isFullyPaid)
    : withPaid;

  return filtered.map((x) => serialize(x.row));
}

export async function getInvoiceById(id: string) {
  const row = await prisma.purchaseInvoice.findUnique({
    where: { id },
    include: { items: { orderBy: { createdAt: 'asc' } } },
  });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Purchase invoice not found.');
  return { ...serialize(row), items: row.items.map(serializeItem) };
}

export async function createInvoice(input: {
  actor: { id: string; role: Role };
  supplierId: string;
  invoiceNumber: string;
  date: string;
  businessDate: string;
  total: string;
  notes?: string | null;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can create invoices.');
  }

  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new ApiError(400, 'INVALID_SUPPLIER', 'Supplier does not exist.');

  const date = parseBusinessDate(input.date);
  const businessDate = parseBusinessDate(input.businessDate);
  const total = toDecimal(input.total);

  try {
    const row = await prisma.purchaseInvoice.create({
      data: {
        invoiceNumber: input.invoiceNumber,
        supplierId: input.supplierId,
        date,
        businessDate,
        subtotal: total,
        total,
        notes: input.notes ?? null,
        createdBy: input.actor.id,
      },
    });
    return serialize(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(
        409,
        'DUPLICATE_INVOICE_NUMBER',
        'This supplier already has an invoice with that number.'
      );
    }
    throw err;
  }
}

export async function updateInvoice(input: {
  id: string;
  actor: { id: string; role: Role };
  invoiceNumber?: string;
  date?: string;
  businessDate?: string;
  total?: string;
  notes?: string | null;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can edit invoices.');
  }

  const existing = await prisma.purchaseInvoice.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Purchase invoice not found.');
  if (existing.status !== 'DRAFT') {
    throw new ApiError(
      409,
      'NOT_EDITABLE',
      `Only DRAFT invoices can be edited (currently ${existing.status}).`
    );
  }

  try {
    const row = await prisma.purchaseInvoice.update({
      where: { id: input.id },
      data: {
        ...(input.invoiceNumber !== undefined ? { invoiceNumber: input.invoiceNumber } : {}),
        ...(input.date !== undefined ? { date: parseBusinessDate(input.date) } : {}),
        ...(input.businessDate !== undefined
          ? { businessDate: parseBusinessDate(input.businessDate) }
          : {}),
        ...(input.total !== undefined
          ? { total: toDecimal(input.total), subtotal: toDecimal(input.total) }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    return serialize(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(
        409,
        'DUPLICATE_INVOICE_NUMBER',
        'This supplier already has an invoice with that number.'
      );
    }
    throw err;
  }
}

export async function deleteDraftInvoice(input: {
  id: string;
  actor: { id: string; role: Role };
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can delete invoices.');
  }
  const existing = await prisma.purchaseInvoice.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Purchase invoice not found.');
  if (existing.status !== 'DRAFT') {
    throw new ApiError(409, 'NOT_DELETABLE', 'Only DRAFT invoices can be deleted.');
  }
  await prisma.purchaseInvoice.delete({ where: { id: input.id } });
}

export async function postInvoice(input: {
  id: string;
  actor: { id: string; role: Role };
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can post invoices.');
  }
  const existing = await prisma.purchaseInvoice.findUnique({
    where: { id: input.id },
    include: { items: { orderBy: { createdAt: 'asc' } } },
  });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Purchase invoice not found.');
  if (existing.status !== 'DRAFT') {
    throw new ApiError(
      409,
      'INVALID_TRANSITION',
      `Only DRAFT invoices can be posted (currently ${existing.status}).`
    );
  }

  // Closed-day guard runs first: an immutable day refuses ALL writes before
  // we evaluate request-content validity.
  await assertDayNotClosed(existing.businessDate, input.actor.role);

  // Phase 14: posting requires items whose totals equal the invoice total.
  if (existing.items.length === 0) {
    throw new ApiError(
      409,
      'NO_ITEMS',
      'Cannot post an invoice that has no items.'
    );
  }
  const itemSum = existing.items.reduce((acc, r) => acc.plus(r.total), toDecimal('0'));
  if (!itemSum.equals(existing.total)) {
    throw new ApiError(
      409,
      'LINE_TOTAL_MISMATCH',
      'Sum of item totals does not match the invoice total.',
      {
        invoiceTotal: toMoneyString(existing.total),
        itemsTotal: toMoneyString(itemSum),
      }
    );
  }

  return prisma.$transaction(async (tx) => {
    // Update Material.currentPrice for each item with a non-null materialId.
    for (const it of existing.items) {
      if (it.materialId) {
        await tx.material.update({
          where: { id: it.materialId },
          data: { currentPrice: it.unitPrice },
        });
      }
    }

    // Phase 15: create one PURCHASE stock movement per materialised item.
    await createPurchaseMovementsFromItems(tx, {
      items: existing.items,
      businessDate: existing.businessDate,
      actorId: input.actor.id,
      invoiceNumber: existing.invoiceNumber,
    });

    const row = await tx.purchaseInvoice.update({
      where: { id: input.id },
      data: {
        status: 'POSTED',
        postedBy: input.actor.id,
        postedAt: new Date(),
      },
    });
    return serialize(row);
  });
}

export async function cancelInvoice(input: {
  id: string;
  actor: { id: string; role: Role };
  reason: string;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can cancel invoices.');
  }

  const existing = await prisma.purchaseInvoice.findUnique({
    where: { id: input.id },
    include: {
      allocations: { where: { voidedAt: null }, select: { id: true } },
    },
  });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Purchase invoice not found.');
  if (existing.status !== 'POSTED') {
    throw new ApiError(
      409,
      'INVALID_TRANSITION',
      `Only POSTED invoices can be cancelled (currently ${existing.status}).`
    );
  }
  if (existing.allocations.length > 0) {
    throw new ApiError(
      409,
      'HAS_ACTIVE_ALLOCATIONS',
      'Void active allocations before cancelling this invoice.'
    );
  }

  await assertDayNotClosed(existing.businessDate, input.actor.role);

  return prisma.$transaction(async (tx) => {
    await reversePurchaseMovementsForInvoice(tx, {
      invoiceId: input.id,
      businessDate: existing.businessDate,
      actorId: input.actor.id,
      invoiceNumber: existing.invoiceNumber,
    });

    const row = await tx.purchaseInvoice.update({
      where: { id: input.id },
      data: {
        status: 'CANCELLED',
        cancelledBy: input.actor.id,
        cancelledAt: new Date(),
        cancelReason: input.reason,
      },
    });
    return serialize(row);
  });
}

export { serialize as serializeInvoice };
