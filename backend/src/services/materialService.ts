import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import { nextDocumentNumber } from '../utils/documentNumber.js';
import type { Prisma, Role } from '@prisma/client';


async function nextMaterialNumber(tx: Prisma.TransactionClient): Promise<string> {
  return nextDocumentNumber(tx, 'material');
}

function serialize(m: {
  id: string;
  materialNumber: string;
  name: string;
  categoryId: string;
  unit: string;
  currentPrice: Prisma.Decimal;
  minimumStock: Prisma.Decimal;
  notes: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: m.id,
    materialNumber: m.materialNumber,
    name: m.name,
    categoryId: m.categoryId,
    unit: m.unit,
    currentPrice: toMoneyString(m.currentPrice),
    minimumStock: toMoneyString(m.minimumStock),
    notes: m.notes,
    isActive: m.isActive,
    createdBy: m.createdBy,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}



export async function listMaterials(opts: {
  includeInactive: boolean;
  categoryId?: string;
  search?: string;
}) {
  const where: Prisma.MaterialWhereInput = {};
  if (!opts.includeInactive) where.isActive = true;
  if (opts.categoryId) where.categoryId = opts.categoryId;
  if (opts.search) {
    where.OR = [
      { name: { contains: opts.search, mode: 'insensitive' } },
      { materialNumber: { contains: opts.search, mode: 'insensitive' } },
    ];
  }

  const rows = await prisma.material.findMany({
    where,
    orderBy: { name: 'asc' },
    take: 200,
  });
  return rows.map(serialize);
}

export async function getMaterialById(id: string) {
  const row = await prisma.material.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Material not found.');
  return serialize(row);
}

export async function createMaterial(input: {
  actor: { id: string; role: Role };
  name: string;
  categoryId: string;
  unit: string;
  currentPrice: string;
  minimumStock?: string;
  notes?: string | null;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can create materials.');
  }

  const category = await prisma.materialCategory.findUnique({
    where: { id: input.categoryId },
  });
  if (!category) throw new ApiError(400, 'INVALID_CATEGORY', 'Category does not exist.');
  if (!category.isActive) {
    throw new ApiError(400, 'CATEGORY_INACTIVE', 'Category is not active.');
  }

  const row = await prisma.$transaction(async (tx) => {
    const materialNumber = await nextMaterialNumber(tx);
    return tx.material.create({
      data: {
        materialNumber,
        name: input.name,
        categoryId: input.categoryId,
        unit: input.unit,
        currentPrice: toDecimal(input.currentPrice),
        minimumStock:
          input.minimumStock !== undefined ? toDecimal(input.minimumStock) : toDecimal('0'),
        notes: input.notes ?? null,
        createdBy: input.actor.id,
      },
    });
  });
  return serialize(row);
}

export async function updateMaterial(
  id: string,
  actor: { id: string; role: Role },
  input: {
    name?: string;
    categoryId?: string;
    unit?: string;
    currentPrice?: string;
    minimumStock?: string;
    notes?: string | null;
    isActive?: boolean;
  }
) {
  if (actor.role !== 'OWNER' && actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can edit materials.');
  }

  const existing = await prisma.material.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Material not found.');

  if (input.categoryId !== undefined) {
    const cat = await prisma.materialCategory.findUnique({ where: { id: input.categoryId } });
    if (!cat) throw new ApiError(400, 'INVALID_CATEGORY', 'Category does not exist.');
    if (!cat.isActive) {
      throw new ApiError(400, 'CATEGORY_INACTIVE', 'Category is not active.');
    }
  }

  const row = await prisma.material.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.currentPrice !== undefined
        ? { currentPrice: toDecimal(input.currentPrice) }
        : {}),
      ...(input.minimumStock !== undefined
        ? { minimumStock: toDecimal(input.minimumStock) }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return serialize(row);
}