import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';

function serialize(c: {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
  };
}

export async function listCategories(opts: { includeInactive: boolean }) {
  const rows = await prisma.expenseCategory.findMany({
    where: opts.includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
  });
  return rows.map(serialize);
}

export async function getCategoryById(id: string) {
  const row = await prisma.expenseCategory.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Expense category not found.');
  return serialize(row);
}

export async function createCategory(input: { name: string; description?: string | null }) {
  const existing = await prisma.expenseCategory.findUnique({ where: { name: input.name } });
  if (existing) {
    throw new ApiError(409, 'NAME_TAKEN', 'A category with that name already exists.');
  }
  const row = await prisma.expenseCategory.create({
    data: { name: input.name, description: input.description ?? null },
  });
  return serialize(row);
}

export async function updateCategory(
  id: string,
  input: { name?: string; description?: string | null; isActive?: boolean }
) {
  const existing = await prisma.expenseCategory.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Expense category not found.');

  if (input.name && input.name !== existing.name) {
    const clash = await prisma.expenseCategory.findUnique({ where: { name: input.name } });
    if (clash) {
      throw new ApiError(409, 'NAME_TAKEN', 'A category with that name already exists.');
    }
  }

  const row = await prisma.expenseCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return serialize(row);
}