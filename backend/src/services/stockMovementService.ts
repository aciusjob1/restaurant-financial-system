import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import { parseBusinessDate, toDateOnly } from '../utils/businessDate.js';
import { assertDayNotClosed } from './closedDayGuard.js';
import type {
  Prisma,
  Role,
  StockMovementType,
  StockMovementDirection,
} from '@prisma/client';

type StockMovementRow = {
  id: string;
  sequence: number;
  materialId: string;
  type: StockMovementType;
  direction: StockMovementDirection;
  businessDate: Date;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal | null;
  totalCost: Prisma.Decimal | null;
  purchaseItemId: string | null;
  reversalOfId: string | null;
  reference: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

function formatMovementNumber(seq: number): string {
  return 'SM-' + String(seq).padStart(4, '0');
}

function serializeMovement(m: StockMovementRow) {
  return {
    id: m.id,
    movementNumber: formatMovementNumber(m.sequence),
    materialId: m.materialId,
    type: m.type,
    direction: m.direction,
    businessDate: toDateOnly(m.businessDate),
    quantity: m.quantity.toFixed(3),
    unitCost: m.unitCost ? toMoneyString(m.unitCost) : null,
    totalCost: m.totalCost ? toMoneyString(m.totalCost) : null,
    purchaseItemId: m.purchaseItemId,
    reversalOfId: m.reversalOfId,
    reference: m.reference,
    notes: m.notes,
    createdBy: m.createdBy,
    createdAt: m.createdAt.toISOString(),
  };
}

// Core primitive: applies one movement and updates Material.currentStock in the same tx.
async function applyMovement(
  tx: Prisma.TransactionClient,
  input: {
    materialId: string;
    type: StockMovementType;
    direction: StockMovementDirection;
    businessDate: Date;
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal | null;
    totalCost: Prisma.Decimal | null;
    purchaseItemId?: string | null;
    reversalOfId?: string | null;
    reference?: string | null;
    notes?: string | null;
    createdBy: string;
  }
) {
  const material = await tx.material.findUnique({ where: { id: input.materialId } });
  if (!material) throw new ApiError(400, 'INVALID_MATERIAL', 'Material does not exist.');
  if (!material.isActive) throw new ApiError(400, 'MATERIAL_INACTIVE', 'Material is not active.');

  if (input.direction === 'OUT') {
    if (material.currentStock.lessThan(input.quantity)) {
      throw new ApiError(
        409,
        'INSUFFICIENT_STOCK',
        `Insufficient stock for ${material.name}: current ${material.currentStock.toFixed(3)}, requested ${input.quantity.toFixed(3)}.`
      );
    }
  }

  const movement = await tx.stockMovement.create({
    data: {
      materialId: input.materialId,
      type: input.type,
      direction: input.direction,
      businessDate: input.businessDate,
      quantity: input.quantity,
      unitCost: input.unitCost,
      totalCost: input.totalCost,
      purchaseItemId: input.purchaseItemId ?? null,
      reversalOfId: input.reversalOfId ?? null,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      createdBy: input.createdBy,
    },
  });

  await tx.material.update({
    where: { id: input.materialId },
    data: {
      currentStock:
        input.direction === 'IN'
          ? { increment: input.quantity }
          : { decrement: input.quantity },
    },
  });

  return movement;
}

// ---------- Public API ----------

export async function createManualMovement(input: {
  actor: { id: string; role: Role };
  materialId: string;
  type: 'OPENING' | 'CONSUMPTION' | 'WASTE' | 'ADJUSTMENT';
  direction: StockMovementDirection;
  businessDate: string;
  quantity: string;
  unitCost?: string | null;
  reference?: string | null;
  notes?: string | null;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can record stock movements.');
  }

  const businessDate = parseBusinessDate(input.businessDate);
  const todayUtc = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  if (businessDate.getTime() > todayUtc.getTime()) {
    throw new ApiError(400, 'FUTURE_DATE', 'Business date cannot be in the future.');
  }
  await assertDayNotClosed(businessDate, input.actor.role);

  const quantity = toDecimal(input.quantity);
  if (quantity.lessThanOrEqualTo(0)) {
    throw new ApiError(400, 'INVALID_QUANTITY', 'Quantity must be positive.');
  }

  const unitCost = input.unitCost ? toDecimal(input.unitCost) : null;
  const totalCost = unitCost ? quantity.times(unitCost).toDecimalPlaces(2) : null;

  return prisma.$transaction(async (tx) => {
    const m = await applyMovement(tx, {
      materialId: input.materialId,
      type: input.type,
      direction: input.direction,
      businessDate,
      quantity,
      unitCost,
      totalCost,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      createdBy: input.actor.id,
    });
    return serializeMovement(m);
  });
}

// Called from purchaseInvoiceService.postInvoice, inside the same transaction.
export async function createPurchaseMovementsFromItems(
  tx: Prisma.TransactionClient,
  input: {
    items: Array<{
      id: string;
      materialId: string | null;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      total: Prisma.Decimal;
    }>;
    businessDate: Date;
    actorId: string;
    invoiceNumber: string;
  }
) {
  for (const item of input.items) {
    if (!item.materialId) continue;
    await applyMovement(tx, {
      materialId: item.materialId,
      type: 'PURCHASE',
      direction: 'IN',
      businessDate: input.businessDate,
      quantity: item.quantity,
      unitCost: item.unitPrice,
      totalCost: item.total,
      purchaseItemId: item.id,
      reference: input.invoiceNumber,
      notes: null,
      createdBy: input.actorId,
    });
  }
}

// Called from purchaseInvoiceService.cancelInvoice, inside the same transaction.
export async function reversePurchaseMovementsForInvoice(
  tx: Prisma.TransactionClient,
  input: {
    invoiceId: string;
    businessDate: Date;
    actorId: string;
    invoiceNumber: string;
  }
) {
  const purchaseMovements = await tx.stockMovement.findMany({
    where: {
      type: 'PURCHASE',
      purchaseItem: { purchaseInvoiceId: input.invoiceId },
    },
    include: { reversedBy: { select: { id: true } } },
  });

  for (const pm of purchaseMovements) {
    if (pm.reversedBy) {
      throw new ApiError(
        409,
        'ALREADY_REVERSED',
        `Purchase movement for item ${pm.purchaseItemId} has already been reversed.`
      );
    }

    try {
      await applyMovement(tx, {
        materialId: pm.materialId,
        type: 'ADJUSTMENT',
        direction: 'OUT',
        businessDate: input.businessDate,
        quantity: pm.quantity,
        unitCost: pm.unitCost,
        totalCost: pm.totalCost,
        reversalOfId: pm.id,
        reference: `Reversal of ${input.invoiceNumber}`,
        notes: null,
        createdBy: input.actorId,
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INSUFFICIENT_STOCK') {
        throw new ApiError(
          409,
          'INSUFFICIENT_STOCK_FOR_CANCEL',
          err.message + ' Correct stock first, then cancel the invoice.'
        );
      }
      throw err;
    }
  }
}

export async function listMovements(opts: {
  materialId?: string;
  type?: StockMovementType;
  direction?: StockMovementDirection;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const where: Prisma.StockMovementWhereInput = {};
  if (opts.materialId) where.materialId = opts.materialId;
  if (opts.type) where.type = opts.type;
  if (opts.direction) where.direction = opts.direction;
  if (opts.from || opts.to) {
    const range: Prisma.DateTimeFilter = {};
    if (opts.from) range.gte = parseBusinessDate(opts.from);
    if (opts.to) range.lte = parseBusinessDate(opts.to);
    where.businessDate = range;
  }

  const take = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const rows = await prisma.stockMovement.findMany({
    where,
    orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
    take,
  });
  return rows.map(serializeMovement);
}

export async function getMovementById(id: string) {
  const row = await prisma.stockMovement.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Stock movement not found.');
  return serializeMovement(row);
}

export async function getMaterialStock(materialId: string) {
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    include: { category: { select: { id: true, name: true } } },
  });
  if (!material) throw new ApiError(404, 'NOT_FOUND', 'Material not found.');

  const recent = await prisma.stockMovement.findMany({
    where: { materialId },
    orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
    take: 20,
  });

  const isBelowMinimum =
    material.minimumStock.greaterThan(0) &&
    material.currentStock.lessThan(material.minimumStock);
  const stockValue = material.currentStock.times(material.currentPrice).toDecimalPlaces(2);

  return {
    material: {
      id: material.id,
      materialNumber: material.materialNumber,
      name: material.name,
      unit: material.unit,
      categoryId: material.categoryId,
      categoryName: material.category.name,
      isActive: material.isActive,
      currentPrice: toMoneyString(material.currentPrice),
      minimumStock: material.minimumStock.toFixed(3),
    },
    currentStock: material.currentStock.toFixed(3),
    isBelowMinimum,
    stockValue: toMoneyString(stockValue),
    recentMovements: recent.map(serializeMovement),
  };
}

export async function getStockValuation() {
  const materials = await prisma.material.findMany({
    where: { isActive: true },
    include: { category: { select: { name: true } } },
    orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
  });

  let total = toDecimal('0');
  const rows = materials.map((m) => {
    const value = m.currentStock.times(m.currentPrice).toDecimalPlaces(2);
    total = total.plus(value);
    return {
      materialId: m.id,
      materialNumber: m.materialNumber,
      name: m.name,
      unit: m.unit,
      categoryName: m.category.name,
      currentStock: m.currentStock.toFixed(3),
      currentPrice: toMoneyString(m.currentPrice),
      stockValue: toMoneyString(value),
    };
  });

  return {
    rows,
    totalValue: toMoneyString(total.toDecimalPlaces(2)),
  };
}

// === Period aggregation for the inventory usage view ===
//
// Computes per-material movement within a period. Design notes:
//
// * Opening balance = signed sum of all movements strictly before `from`.
//   That is the ledger's view of the starting stock.
//
// * "Closing" is derived from the raw signed sum of period movements
//   (opening + net in period), NOT from summing per-type columns. If the
//   per-type columns ever disagree with the signed sum, that is a data
//   integrity problem and we flag it.
//
// * openingReconstructed = currentStock - netInPeriod. If this differs
//   from openingFromLedger, the ledger does not fully explain the balance
//   (e.g. a material whose stock predates its first movement row).
//   historyComplete captures that.
//
// * periods do NOT go through listMovements(). That function applies a
//   take cap and would truncate a month. We read every movement inside
//   [from, to] and group in memory.

type UsagePeriod = 'daily' | 'weekly' | 'monthly';

function utcToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

function periodRangeUtc(period: UsagePeriod, anchor: Date): { from: Date; to: Date } {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  const d = anchor.getUTCDate();
  const day = new Date(Date.UTC(y, m, d));

  if (period === 'daily') return { from: day, to: day };

  if (period === 'weekly') {
    // Monday-start. JS getUTCDay: Sun=0 .. Sat=6. Days-since-Monday: Mon=0 .. Sun=6.
    const dow = (day.getUTCDay() + 6) % 7;
    const monday = new Date(day);
    monday.setUTCDate(day.getUTCDate() - dow);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { from: monday, to: sunday };
  }

  // monthly -- calendar month, first through last day
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  return { from: first, to: last };
}

function dateOnlyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getStockUsage(opts: {
  period: UsagePeriod;
  anchorDate: string;
  materialId?: string;
}) {
  // Clamp future anchors to today. An "October 2027" period is not a
  // thing the manager can meaningfully review, and it would also break
  // the includesToday check below.
  const rawAnchor = parseBusinessDate(opts.anchorDate);
  const today = utcToday();
  const anchor = rawAnchor.getTime() > today.getTime() ? today : rawAnchor;

  const { from, to } = periodRangeUtc(opts.period, anchor);

  // Opening: signed sum of all movements strictly before `from`.
  // groupBy returns (materialId, direction, _sum.quantity) -- we apply
  // the sign in JS. Indexed on [materialId, businessDate].
  const openingGroups = await prisma.stockMovement.groupBy({
    by: ['materialId', 'direction'],
    where: {
      businessDate: { lt: from },
      ...(opts.materialId ? { materialId: opts.materialId } : {}),
    },
    _sum: { quantity: true },
  });
  const openingByMaterial = new Map<string, Prisma.Decimal>();
  for (const g of openingGroups) {
    const q = g._sum.quantity ?? toDecimal('0');
    const signed = g.direction === 'IN' ? q : q.negated();
    const cur = openingByMaterial.get(g.materialId) ?? toDecimal('0');
    openingByMaterial.set(g.materialId, cur.plus(signed));
  }

  // Signed sum of everything from `from` onward (per material). Used to
  // reconstruct the opening balance from currentStock and to detect
  // divergence between the ledger and the cached balance. Reading only
  // the period is not enough -- movements AFTER `to` still affect
  // currentStock today.
  const fromOnwardGroups = await prisma.stockMovement.groupBy({
    by: ['materialId', 'direction'],
    where: {
      businessDate: { gte: from },
      ...(opts.materialId ? { materialId: opts.materialId } : {}),
    },
    _sum: { quantity: true },
  });
  const netFromOnwardByMaterial = new Map<string, Prisma.Decimal>();
  for (const g of fromOnwardGroups) {
    const q = g._sum.quantity ?? toDecimal('0');
    const signed = g.direction === 'IN' ? q : q.negated();
    const cur = netFromOnwardByMaterial.get(g.materialId) ?? toDecimal('0');
    netFromOnwardByMaterial.set(g.materialId, cur.plus(signed));
  }

  // Every movement inside the period, no take limit.
  const periodRows = await prisma.stockMovement.findMany({
    where: {
      businessDate: { gte: from, lte: to },
      ...(opts.materialId ? { materialId: opts.materialId } : {}),
    },
    select: {
      materialId: true,
      type: true,
      direction: true,
      quantity: true,
    },
  });

  // Materials for name/unit/category/currentStock/currentPrice. Every
  // active material appears in the result even with zero movements, so
  // "no usage this period" is visible rather than a missing row.
  const materials = await prisma.material.findMany({
    where: opts.materialId ? { id: opts.materialId } : { isActive: true },
    include: { category: { select: { name: true } } },
    orderBy: [{ name: 'asc' }],
  });

  type Acc = {
    purchases: Prisma.Decimal;
    openingEntries: Prisma.Decimal;
    consumed: Prisma.Decimal;
    wasted: Prisma.Decimal;
    adjusted: Prisma.Decimal;
    net: Prisma.Decimal;
  };
  const zero = (): Acc => ({
    purchases: toDecimal('0'),
    openingEntries: toDecimal('0'),
    consumed: toDecimal('0'),
    wasted: toDecimal('0'),
    adjusted: toDecimal('0'),
    net: toDecimal('0'),
  });
  const byMaterial = new Map<string, Acc>();
  for (const r of periodRows) {
    const a = byMaterial.get(r.materialId) ?? zero();
    const signed = r.direction === 'IN' ? r.quantity : r.quantity.negated();
    a.net = a.net.plus(signed);
    switch (r.type) {
      case 'PURCHASE':     a.purchases = a.purchases.plus(signed); break;
      case 'OPENING':      a.openingEntries = a.openingEntries.plus(signed); break;
      case 'CONSUMPTION':  a.consumed = a.consumed.plus(signed); break;
      case 'WASTE':        a.wasted = a.wasted.plus(signed); break;
      case 'ADJUSTMENT':   a.adjusted = a.adjusted.plus(signed); break;
    }
    byMaterial.set(r.materialId, a);
  }

  // includesToday is true only when today falls inside [from, to].
  const todayTs = today.getTime();
  const includesToday = from.getTime() <= todayTs && to.getTime() >= todayTs;

  let totalConsumedQty = toDecimal('0');
  let totalEstValue = toDecimal('0');

  const rows = materials.map((m) => {
    const a = byMaterial.get(m.id) ?? zero();
    const openingFromLedger = openingByMaterial.get(m.id) ?? toDecimal('0');

    // closing derived from the raw signed sum, not from summing columns.
    const closing = openingFromLedger.plus(a.net);

    // Cross-check: sum of per-type columns should equal a.net.
    const columnsSum = a.purchases
      .plus(a.openingEntries)
      .plus(a.consumed)
      .plus(a.wasted)
      .plus(a.adjusted);
    const columnsConsistent = columnsSum.equals(a.net);

    // Reconstruct opening from currentStock minus everything that has
    // happened from `from` onward. This is the correct "ledger explains
    // current balance" check; subtracting only the period's net would be
    // wrong when movements exist after `to`.
    const netFromOnward = netFromOnwardByMaterial.get(m.id) ?? toDecimal('0');
    const openingReconstructed = m.currentStock.minus(netFromOnward);
    const historyComplete = openingReconstructed.equals(openingFromLedger);

    const estValue = a.consumed.times(m.currentPrice).toDecimalPlaces(2);
    totalConsumedQty = totalConsumedQty.plus(a.consumed);
    totalEstValue = totalEstValue.plus(estValue);

    const variance = includesToday ? closing.minus(m.currentStock) : null;

    return {
      materialId: m.id,
      materialNumber: m.materialNumber,
      name: m.name,
      unit: m.unit,
      categoryName: m.category.name,

      opening: openingFromLedger.toFixed(3),
      purchasesNet: a.purchases.toFixed(3),
      openingEntriesNet: a.openingEntries.toFixed(3),
      consumed: a.consumed.toFixed(3),
      wasted: a.wasted.toFixed(3),
      adjustedNet: a.adjusted.toFixed(3),
      closing: closing.toFixed(3),

      currentStock: m.currentStock.toFixed(3),
      variance: variance === null ? null : variance.toFixed(3),
      estConsumptionValue: toMoneyString(estValue),

      historyComplete,
      columnsConsistent,
    };
  });

  return {
    period: opts.period,
    from: dateOnlyUtc(from),
    to: dateOnlyUtc(to),
    includesToday,
    rows,
    totals: {
      consumedQty: totalConsumedQty.toFixed(3),
      estConsumptionValue: toMoneyString(totalEstValue.toDecimalPlaces(2)),
    },
  };
}
