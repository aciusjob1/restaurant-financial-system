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