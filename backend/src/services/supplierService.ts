import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import { nextDocumentNumber } from '../utils/documentNumber.js';
import type { PaymentMethod, Prisma, Role } from '@prisma/client';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}

function serializeSupplier(s: {
  id: string;
  supplierNumber: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  contactPerson: string | null;
  tin: string | null;
  paymentTerms: string | null;
  notes: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: s.id,
    supplierNumber: s.supplierNumber,
    name: s.name,
    phone: s.phone,
    email: s.email,
    address: s.address,
    contactPerson: s.contactPerson,
    tin: s.tin,
    paymentTerms: s.paymentTerms,
    notes: s.notes,
    isActive: s.isActive,
    createdBy: s.createdBy,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

async function nextSupplierNumber(tx: Prisma.TransactionClient): Promise<string> {
  return nextDocumentNumber(tx, 'supplier');
}

export async function listSuppliers(opts: {
  includeInactive: boolean;
  search?: string;
}) {
  const where: Prisma.SupplierWhereInput = {};
  if (!opts.includeInactive) where.isActive = true;
  if (opts.search) {
    where.OR = [
      { name: { contains: opts.search, mode: 'insensitive' } },
      { contactPerson: { contains: opts.search, mode: 'insensitive' } },
      { phone: { contains: opts.search, mode: 'insensitive' } },
      { supplierNumber: { contains: opts.search, mode: 'insensitive' } },
    ];
  }
  const rows = await prisma.supplier.findMany({
    where,
    orderBy: [{ name: 'asc' }],
    take: 200,
  });
  return rows.map(serializeSupplier);
}

export async function getSupplierById(id: string) {
  const row = await prisma.supplier.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Supplier not found.');
  return serializeSupplier(row);
}

export async function createSupplier(input: {
  actor: { id: string; role: Role };
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  contactPerson?: string | null;
  tin?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can create suppliers.');
  }

  try {
    const row = await prisma.$transaction(async (tx) => {
      const supplierNumber = await nextSupplierNumber(tx);
      return tx.supplier.create({
        data: {
          supplierNumber,
          name: input.name,
          phone: input.phone ?? null,
          email: input.email ?? null,
          address: input.address ?? null,
          contactPerson: input.contactPerson ?? null,
          tin: input.tin ?? null,
          paymentTerms: input.paymentTerms ?? null,
          notes: input.notes ?? null,
          createdBy: input.actor.id,
        },
      });
    });
    return serializeSupplier(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, 'DUPLICATE', 'Duplicate supplier number.');
    }
    throw err;
  }
}

export async function updateSupplier(
  id: string,
  actor: { id: string; role: Role },
  input: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    contactPerson?: string | null;
    tin?: string | null;
    paymentTerms?: string | null;
    notes?: string | null;
    isActive?: boolean;
  }
) {
  if (actor.role !== 'OWNER' && actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can edit suppliers.');
  }

  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Supplier not found.');

  const row = await prisma.supplier.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.contactPerson !== undefined ? { contactPerson: input.contactPerson } : {}),
      ...(input.tin !== undefined ? { tin: input.tin } : {}),
      ...(input.paymentTerms !== undefined ? { paymentTerms: input.paymentTerms } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return serializeSupplier(row);
}

/**
 * Supplier balance (B2):
 *   balance = sum(POSTED invoice totals) - sum(non-voided payment amounts)
 *
 * Also returns:
 *   totalInvoiced   = sum(POSTED invoice totals)
 *   totalPaid       = sum(non-voided payment amounts)
 *   totalAllocated  = sum(non-voided allocation amounts)
 *   totalUnallocated = totalPaid - totalAllocated
 */
export async function getSupplierBalance(supplierId: string) {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw new ApiError(404, 'NOT_FOUND', 'Supplier not found.');

  const invoices = await prisma.purchaseInvoice.findMany({
    where: { supplierId, status: 'POSTED' },
    select: { total: true },
  });
  const totalInvoiced = invoices.reduce((acc, r) => acc.plus(r.total), toDecimal('0'));

  const payments = await prisma.supplierPayment.findMany({
    where: { supplierId, voidedAt: null },
    select: { amount: true },
  });
  const totalPaid = payments.reduce((acc, r) => acc.plus(r.amount), toDecimal('0'));

  const allocations = await prisma.paymentAllocation.findMany({
    where: {
      supplierPayment: { supplierId, voidedAt: null },
      voidedAt: null,
    },
    select: { amount: true },
  });
  const totalAllocated = allocations.reduce((acc, r) => acc.plus(r.amount), toDecimal('0'));

  const balance = totalInvoiced.minus(totalPaid);
  const totalUnallocated = totalPaid.minus(totalAllocated);

  return {
    supplierId,
    balance: toMoneyString(balance),
    totalInvoiced: toMoneyString(totalInvoiced),
    totalPaid: toMoneyString(totalPaid),
    totalAllocated: toMoneyString(totalAllocated),
    totalUnallocated: toMoneyString(totalUnallocated),
  };
}

export { isUniqueViolation };