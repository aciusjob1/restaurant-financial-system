import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { serializeInvoice } from './purchaseInvoiceService.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import type { Prisma, Role } from '@prisma/client';

function serialize(i: {
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

function computeTotal(quantity: Prisma.Decimal, unitPrice: Prisma.Decimal): Prisma.Decimal {
  // quantity * unitPrice, rounded half-up to 2 decimals.
  return quantity.times(unitPrice).toDecimalPlaces(2, 4 /* ROUND_HALF_UP */);
}

export async function listItemsForInvoice(invoiceId: string) {
  const invoice = await prisma.purchaseInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new ApiError(404, 'NOT_FOUND', 'Purchase invoice not found.');

  const rows = await prisma.purchaseItem.findMany({
    where: { purchaseInvoiceId: invoiceId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(serialize);
}

export async function replaceItems(input: {
  invoiceId: string;
  actor: { id: string; role: Role };
  items: Array<{
    materialId: string;
    quantity: string;
    unitPrice: string;
    notes?: string | null;
  }>;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can edit purchase items.');
  }

  const invoice = await prisma.purchaseInvoice.findUnique({ where: { id: input.invoiceId } });
  if (!invoice) throw new ApiError(404, 'NOT_FOUND', 'Purchase invoice not found.');
  if (invoice.status !== 'DRAFT') {
    throw new ApiError(
      409,
      'NOT_EDITABLE',
      `Only DRAFT invoices can have their items edited (currently ${invoice.status}).`
    );
  }

  // Validate that every material exists and is active.
  const materialIds = Array.from(new Set(input.items.map((i) => i.materialId)));
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds } },
    select: { id: true, isActive: true },
  });
  const found = new Map(materials.map((m) => [m.id, m]));
  for (const id of materialIds) {
    const m = found.get(id);
    if (!m) throw new ApiError(400, 'INVALID_MATERIAL', `Material ${id} does not exist.`);
    if (!m.isActive) {
      throw new ApiError(400, 'MATERIAL_INACTIVE', `Material ${id} is not active.`);
    }
  }

  // Compute line totals.
  const computed = input.items.map((it) => {
    const qty = toDecimal(it.quantity);
    const unit = toDecimal(it.unitPrice);
    return {
      materialId: it.materialId,
      quantity: qty,
      unitPrice: unit,
      total: computeTotal(qty, unit),
      notes: it.notes ?? null,
    };
  });

  const sumTotal = computed.reduce((acc, r) => acc.plus(r.total), toDecimal('0'));

  return prisma.$transaction(async (tx) => {
    // Full replace: delete existing items, create new ones.
    await tx.purchaseItem.deleteMany({ where: { purchaseInvoiceId: input.invoiceId } });

    for (const c of computed) {
      await tx.purchaseItem.create({
        data: {
          purchaseInvoiceId: input.invoiceId,
          materialId: c.materialId,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          total: c.total,
          notes: c.notes,
        },
      });
    }

    // Update the invoice subtotal/total to match the items. Since Phase 12
    // stored subtotal == total and had no tax/discount, the new total is
    // exactly the sum of line totals.
    const updated = await tx.purchaseInvoice.update({
      where: { id: input.invoiceId },
      data: { subtotal: sumTotal, total: sumTotal },
    });

    const rows = await tx.purchaseItem.findMany({
      where: { purchaseInvoiceId: input.invoiceId },
      orderBy: { createdAt: 'asc' },
    });

    return { invoice: serializeInvoice(updated), items: rows.map(serialize) };
  });
}