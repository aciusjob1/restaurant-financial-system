import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { resolveAttributedUser } from '../utils/attributedUser.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import type { PaymentMethod, Prisma } from '@prisma/client';
import { ensureOpenShiftForUserAndDate } from './shiftService.js';
import { todayBusinessDate } from '../utils/businessDate.js';

const EDITABLE_SHIFT_STATUSES = new Set(['OPEN'] as const);

function serialize(c: {
  id: string;
  shiftId: string;
  userId: string;
  paymentMethod: PaymentMethod;
  amount: Prisma.Decimal;
  mobileReference: string | null;
  notes: string | null;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    shiftId: c.shiftId,
    userId: c.userId,
    paymentMethod: c.paymentMethod,
    amount: toMoneyString(c.amount),
    mobileReference: c.mobileReference,
    notes: c.notes,
    voidedAt: c.voidedAt ? c.voidedAt.toISOString() : null,
    voidedBy: c.voidedBy,
    voidReason: c.voidReason,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function loadEditableShift(shiftId: string) {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) throw new ApiError(404, 'SHIFT_NOT_FOUND', 'Shift not found.');
  return shift;
}

function assertShiftOpen(status: string, action: string) {
  if (!EDITABLE_SHIFT_STATUSES.has(status as 'OPEN')) {
    throw new ApiError(
      409,
      'SHIFT_NOT_OPEN',
      `Cannot ${action} a collection while the shift is ${status}.`
    );
  }
}

export async function listCollections(opts: {
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' };
  shiftId?: string;
  userId?: string;
  includeVoided: boolean;
}) {
  const where: Prisma.CollectionWhereInput = {};

  if (opts.actor.role === 'WAITER') {
    where.userId = opts.actor.id;
  } else if (opts.userId) {
    where.userId = opts.userId;
  }

  if (opts.shiftId) where.shiftId = opts.shiftId;
  if (!opts.includeVoided) where.voidedAt = null;

  const rows = await prisma.collection.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: 500,
  });
  return rows.map(serialize);
}

export async function getCollectionById(
  id: string,
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' }
) {
  const row = await prisma.collection.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Collection not found.');
  if (actor.role === 'WAITER' && row.userId !== actor.id) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission.');
  }
  return serialize(row);
}

export async function createCollection(input: {
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' };
  shiftId?: string;
  paymentMethod: PaymentMethod;
  amount: string;
  mobileReference: string | null;
  notes: string | null;
  onBehalfOfUserId: string | null;
}) {
  // Resolve attributed user: WAITER → self; MANAGER/OWNER → required target.
  const attributedUserId = resolveAttributedUser(input.actor, input.onBehalfOfUserId);

  // Auto-open the attributed user's shift for today if none exists.
  const shift = input.shiftId
    ? await loadEditableShift(input.shiftId)
    : await ensureOpenShiftForUserAndDate(attributedUserId, todayBusinessDate());
  if (shift.userId !== attributedUserId) {
    throw new ApiError(403, 'FORBIDDEN', 'Shift is not owned by the attributed user.');
  }
  assertShiftOpen(shift.status, 'create');

  try {
    const row = await prisma.collection.create({
      data: {
        shiftId: shift.id,
        userId: attributedUserId,
        createdById: input.actor.id,
        paymentMethod: input.paymentMethod,
        amount: toDecimal(input.amount),
        mobileReference: input.mobileReference,
        notes: input.notes,
      },
    });
    return serialize(row);
  } catch (err) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      throw new ApiError(
        409,
        'DUPLICATE_MOBILE_REFERENCE',
        'That mobile reference has already been declared for this shift.'
      );
    }
    throw err;
  }
}

export async function updateCollection(input: {
  id: string;
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' };
  amount?: string;
  mobileReference?: string | null;
  notes?: string | null;
}) {
  const existing = await prisma.collection.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Collection not found.');

  // Only the owning waiter may edit.
  if (input.actor.role !== 'WAITER' || existing.userId !== input.actor.id) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission.');
  }

  const shift = await loadEditableShift(existing.shiftId);
  assertShiftOpen(shift.status, 'edit');

  if (existing.voidedAt) {
    throw new ApiError(409, 'COLLECTION_VOIDED', 'Cannot edit a voided collection.');
  }

  try {
    const row = await prisma.collection.update({
      where: { id: input.id },
      data: {
        ...(input.amount !== undefined ? { amount: toDecimal(input.amount) } : {}),
        ...(input.mobileReference !== undefined
          ? { mobileReference: input.mobileReference }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    return serialize(row);
  } catch (err) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      throw new ApiError(
        409,
        'DUPLICATE_MOBILE_REFERENCE',
        'That mobile reference has already been declared for this shift.'
      );
    }
    throw err;
  }
}

export async function voidCollection(input: {
  id: string;
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' };
  reason: string;
}) {
  const existing = await prisma.collection.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Collection not found.');

  // A WAITER may void only their own; MANAGER/OWNER may void any; AUDITOR may not.
  if (input.actor.role === 'AUDITOR') {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission.');
  }
  if (input.actor.role === 'WAITER' && existing.userId !== input.actor.id) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission.');
  }

  if (existing.voidedAt) {
    throw new ApiError(409, 'ALREADY_VOIDED', 'Collection is already voided.');
  }

  const shift = await loadEditableShift(existing.shiftId);
  assertShiftOpen(shift.status, 'void');

  const row = await prisma.collection.update({
    where: { id: input.id },
    data: {
      voidedAt: new Date(),
      voidedBy: input.actor.id,
      voidReason: input.reason,
    },
  });
  return serialize(row);
}