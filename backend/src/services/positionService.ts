import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import type { Prisma } from '@prisma/client';

function serializePosition(p: {
  id: string;
  name: string;
  description: string | null;
  defaultSalary: Prisma.Decimal;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    defaultSalary: toMoneyString(p.defaultSalary),
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function listPositions() {
  const rows = await prisma.position.findMany({
    orderBy: { name: 'asc' },
  });
  return rows.map(serializePosition);
}

export async function getPositionById(id: string) {
  const row = await prisma.position.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Position not found.');
  return serializePosition(row);
}

export async function createPosition(input: {
  name: string;
  description?: string | null;
  defaultSalary: string;
}) {
  const existing = await prisma.position.findUnique({ where: { name: input.name } });
  if (existing) {
    throw new ApiError(409, 'NAME_TAKEN', 'A position with that name already exists.');
  }

  const row = await prisma.position.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      defaultSalary: toDecimal(input.defaultSalary),
    },
  });
  return serializePosition(row);
}

export async function updatePosition(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    defaultSalary?: string;
    isActive?: boolean;
  }
) {
  const existing = await prisma.position.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Position not found.');

  if (input.name && input.name !== existing.name) {
    const clash = await prisma.position.findUnique({ where: { name: input.name } });
    if (clash) {
      throw new ApiError(409, 'NAME_TAKEN', 'A position with that name already exists.');
    }
  }

  const row = await prisma.position.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.defaultSalary !== undefined
        ? { defaultSalary: toDecimal(input.defaultSalary) }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return serializePosition(row);
}