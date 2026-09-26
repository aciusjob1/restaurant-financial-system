import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import type { Role } from '@prisma/client';

function serialize(c: {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    isActive: c.isActive,
    createdBy: c.createdBy,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function listCategories(opts: { includeInactive: boolean }) {
  const rows = await prisma.materialCategory.findMany({
    where: opts.includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
    take: 200,
  });
  return rows.map(serialize);
}

export async function getCategoryById(id: string) {
  const row = await prisma.materialCategory.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Material category not found.');
  return serialize(row);
}

export async function createCategory(input: {
  actor: { id: string; role: Role };
  name: string;
  description?: string | null;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can create material categories.');
  }
  const existing = await prisma.materialCategory.findUnique({ where: { name: input.name } });
  if (existing) {
    throw new ApiError(409, 'NAME_TAKEN', 'A material category with that name already exists.');
  }
  const row = await prisma.materialCategory.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      createdBy: input.actor.id,
    },
  });
  return serialize(row);
}

export async function updateCategory(
  id: string,
  actor: { id: string; role: Role },
  input: { name?: string; description?: string | null; isActive?: boolean }
) {
  if (actor.role !== 'OWNER' && actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can edit material categories.');
  }
  const existing = await prisma.materialCategory.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Material category not found.');

  if (input.name && input.name !== existing.name) {
    const clash = await prisma.materialCategory.findUnique({ where: { name: input.name } });
    if (clash) {
      throw new ApiError(409, 'NAME_TAKEN', 'A material category with that name already exists.');
    }
  }

  const row = await prisma.materialCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return serialize(row);
}