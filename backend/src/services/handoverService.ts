import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { resolveAttributedUser } from '../utils/attributedUser.js';
import { toMoneyString } from '../utils/money.js';
import type { CashHandoverStatus, Prisma } from '@prisma/client';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}

function serialize(h: {
  id: string;
  reconciliationId: string;
  fromUserId: string;
  toUserId: string;
  amount: Prisma.Decimal;
  status: CashHandoverStatus;
  handedOverAt: Date;
  confirmedAt: Date | null;
  notes: string | null;
  confirmedNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: h.id,
    reconciliationId: h.reconciliationId,
    fromUserId: h.fromUserId,
    toUserId: h.toUserId,
    amount: toMoneyString(h.amount),
    status: h.status,
    handedOverAt: h.handedOverAt.toISOString(),
    confirmedAt: h.confirmedAt ? h.confirmedAt.toISOString() : null,
    notes: h.notes,
    confirmedNotes: h.confirmedNotes,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
  };
}

export async function listHandovers(opts: {
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' };
  reconciliationId?: string;
  fromUserId?: string;
  toUserId?: string;
  status?: CashHandoverStatus;
}) {
  const where: Prisma.CashHandoverWhereInput = {};

  if (opts.actor.role === 'WAITER') {
    // Waiters see handovers they sent or received (receivers are managers, so
    // effectively their own).
    where.fromUserId = opts.actor.id;
  } else {
    if (opts.fromUserId) where.fromUserId = opts.fromUserId;
    if (opts.toUserId) where.toUserId = opts.toUserId;
  }

  if (opts.reconciliationId) where.reconciliationId = opts.reconciliationId;
  if (opts.status) where.status = opts.status;

  const rows = await prisma.cashHandover.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
  });
  return rows.map(serialize);
}

export async function getHandoverById(
  id: string,
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' }
) {
  const row = await prisma.cashHandover.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Handover not found.');
  if (
    actor.role === 'WAITER' &&
    row.fromUserId !== actor.id &&
    row.toUserId !== actor.id
  ) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission.');
  }
  return serialize(row);
}

export async function createHandover(input: {
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' };
  reconciliationId: string;
  toUserId: string;
  notes: string | null;
  onBehalfOfUserId: string | null;
}) {
  // Resolve attributed user: WAITER → self; MANAGER/OWNER → required target.
  const attributedUserId = resolveAttributedUser(input.actor, input.onBehalfOfUserId);

  const recon = await prisma.reconciliation.findUnique({
    where: { id: input.reconciliationId },
  });
  if (!recon) throw new ApiError(404, 'RECON_NOT_FOUND', 'Reconciliation not found.');
  if (recon.userId !== attributedUserId) {
    throw new ApiError(403, 'FORBIDDEN', 'Reconciliation is not owned by the attributed user.');
  }
  if (recon.status !== 'SUBMITTED' && recon.status !== 'REVIEWED') {
    throw new ApiError(
      409,
      'RECON_NOT_READY',
      `Cannot create a handover while the reconciliation is ${recon.status}.`
    );
  }
  if (recon.actualCash === null) {
    throw new ApiError(
      409,
      'NO_ACTUAL_CASH',
      'Reconciliation has no actualCash value; cannot hand over.'
    );
  }

  // Receiver must be MANAGER or OWNER.
  const receiver = await prisma.user.findUnique({ where: { id: input.toUserId } });
  if (!receiver) {
    throw new ApiError(400, 'INVALID_RECEIVER', 'Receiver does not exist.');
  }
  if (receiver.role !== 'MANAGER' && receiver.role !== 'OWNER') {
    throw new ApiError(
      400,
      'INVALID_RECEIVER',
      'Receiver must be a MANAGER or OWNER.'
    );
  }

  try {
    const row = await prisma.cashHandover.create({
      data: {
        reconciliationId: recon.id,
        fromUserId: attributedUserId,
        createdById: input.actor.id,
        toUserId: input.toUserId,
        amount: recon.actualCash, // server-derived; client cannot choose
        notes: input.notes,
      },
    });
    return serialize(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(
        409,
        'HANDOVER_EXISTS',
        'A handover already exists for that reconciliation.'
      );
    }
    throw err;
  }
}

export async function confirmHandover(input: {
  id: string;
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' };
  confirmedNotes?: string;
}) {
  if (input.actor.role !== 'MANAGER' && input.actor.role !== 'OWNER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only MANAGER or OWNER can confirm.');
  }

  const existing = await prisma.cashHandover.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Handover not found.');
  if (existing.status !== 'PENDING') {
    throw new ApiError(
      409,
      'INVALID_TRANSITION',
      `Only PENDING handovers can be confirmed (currently ${existing.status}).`
    );
  }

  const row = await prisma.cashHandover.update({
    where: { id: input.id },
    data: {
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      confirmedNotes: input.confirmedNotes ?? null,
    },
  });
  return serialize(row);
}
/**
 * Reduced projection of users who may receive a cash handover.
 * Used by the WAITER kiosk to populate the "receiver" dropdown.
 *
 * Returns only active MANAGER and OWNER users, with id/fullName/role.
 * No email, phone, or permission fields. Filtering is enforced by the
 * query — the frontend must not decide who is eligible.
 */
export async function listReceivableUsers() {
  const rows = await prisma.user.findMany({
    where: {
      role: { in: ['MANAGER', 'OWNER'] },
      isActive: true,
    },
    select: { id: true, fullName: true, role: true },
    orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
  });
  return rows;
}
