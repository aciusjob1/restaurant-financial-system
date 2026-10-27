import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { assertDayNotClosed } from './closedDayGuard.js';
import { resolveAttributedUser } from '../utils/attributedUser.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import type { CashHandoverStatus, Prisma } from '@prisma/client';
import { ensureOpenShiftForUserAndDate } from './shiftService.js';
import { todayBusinessDate } from '../utils/businessDate.js';

function serialize(h: {
  id: string;
  shiftId: string;
  reconciliationId: string | null;
  fromUserId: string;
  toUserId: string;
  amount: Prisma.Decimal;
  status: CashHandoverStatus;
  handedOverAt: Date;
  confirmedAt: Date | null;
  notes: string | null;
  confirmedNotes: string | null;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: h.id,
    shiftId: h.shiftId,
    reconciliationId: h.reconciliationId,
    fromUserId: h.fromUserId,
    toUserId: h.toUserId,
    amount: toMoneyString(h.amount),
    status: h.status,
    handedOverAt: h.handedOverAt.toISOString(),
    confirmedAt: h.confirmedAt ? h.confirmedAt.toISOString() : null,
    notes: h.notes,
    confirmedNotes: h.confirmedNotes,
    voidedAt: h.voidedAt ? h.voidedAt.toISOString() : null,
    voidedBy: h.voidedBy,
    voidReason: h.voidReason,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
  };
}

export async function listHandovers(opts: {
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' };
  shiftId?: string;
  reconciliationId?: string;
  fromUserId?: string;
  toUserId?: string;
  status?: CashHandoverStatus;
  includeVoided: boolean;
}) {
  const where: Prisma.CashHandoverWhereInput = {};

  if (opts.actor.role === 'WAITER') {
    // A waiter may be the sender or the designated receiver.
    where.OR = [{ fromUserId: opts.actor.id }, { toUserId: opts.actor.id }];
  } else {
    if (opts.fromUserId) where.fromUserId = opts.fromUserId;
    if (opts.toUserId) where.toUserId = opts.toUserId;
  }

  if (opts.shiftId) where.shiftId = opts.shiftId;
  if (opts.reconciliationId) where.reconciliationId = opts.reconciliationId;
  if (opts.status) where.status = opts.status;
  if (!opts.includeVoided) where.voidedAt = null;

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
  shiftId?: string;
  amount: string;
  toUserId: string;
  notes: string | null;
  onBehalfOfUserId: string | null;
}) {
  const attributedUserId = resolveAttributedUser(input.actor, input.onBehalfOfUserId);

  // Owner preference: when autoConfirmHandovers is ON, a handover
  // created by the OWNER lands CONFIRMED with confirmedAt = now.
  // Checked only when the actor is OWNER - MANAGER and WAITER
  // paths keep the schema default PENDING.
  let ownerAutoConfirm = false;
  if (input.actor.role === 'OWNER') {
    const pref = await prisma.user.findUnique({
      where: { id: input.actor.id },
      select: { autoConfirmHandovers: true },
    });
    ownerAutoConfirm = pref?.autoConfirmHandovers === true;
  }

  const shift = input.shiftId
    ? await prisma.shift.findUnique({
        where: { id: input.shiftId },
        include: { reconciliation: { select: { id: true } } },
      })
    : await ensureOpenShiftForUserAndDate(attributedUserId, todayBusinessDate()).then(
        (s) => prisma.shift.findUnique({
          where: { id: s.id },
          include: { reconciliation: { select: { id: true } } },
        }),
      );
  if (!shift) throw new ApiError(404, 'SHIFT_NOT_FOUND', 'Shift not found.');
  if (shift.userId !== attributedUserId) {
    throw new ApiError(403, 'FORBIDDEN', 'Shift is not owned by the attributed user.');
  }

  const receiver = await prisma.user.findUnique({ where: { id: input.toUserId } });
  if (!receiver) {
    throw new ApiError(400, 'INVALID_RECEIVER', 'Receiver does not exist.');
  }
  if (receiver.role !== 'MANAGER' && receiver.role !== 'OWNER') {
    throw new ApiError(400, 'INVALID_RECEIVER', 'Receiver must be a MANAGER or OWNER.');
  }
  if (!receiver.isActive) {
    throw new ApiError(400, 'INVALID_RECEIVER', 'Receiver is not an active user.');
  }
  if (input.toUserId === attributedUserId) {
    throw new ApiError(400, 'SELF_HANDOVER', 'You cannot hand cash over to yourself.');
  }

  await assertDayNotClosed(shift.businessDate, input.actor.role);

  const now = new Date();
  const row = await prisma.cashHandover.create({
    data: {
      shiftId: shift.id,
      reconciliationId: shift.reconciliation ? shift.reconciliation.id : null,
      fromUserId: attributedUserId,
      createdById: input.actor.id,
      toUserId: input.toUserId,
      amount: toDecimal(input.amount),
      notes: input.notes,
      status: ownerAutoConfirm ? 'CONFIRMED' : 'PENDING',
      confirmedAt: ownerAutoConfirm ? now : null,
    },
  });
  return serialize(row);
}

export async function voidHandover(input: {
  id: string;
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' };
  reason: string;
}) {
  if (input.actor.role !== 'MANAGER' && input.actor.role !== 'OWNER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only MANAGER or OWNER can void a handover.');
  }

  const existing = await prisma.cashHandover.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Handover not found.');
  if (existing.voidedAt) {
    throw new ApiError(409, 'ALREADY_VOIDED', 'Handover is already voided.');
  }

  const shift = await prisma.shift.findUnique({
    where: { id: existing.shiftId },
    select: { businessDate: true },
  });
  if (!shift) throw new ApiError(404, 'SHIFT_NOT_FOUND', 'Shift not found.');
  await assertDayNotClosed(shift.businessDate, input.actor.role);

  const row = await prisma.cashHandover.update({
    where: { id: input.id },
    data: {
      voidedAt: new Date(),
      voidedBy: input.actor.id,
      voidReason: input.reason,
    },
  });
  return serialize(row);
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
  if (existing.voidedAt) {
    throw new ApiError(409, 'HANDOVER_VOIDED', 'Cannot confirm a voided handover.');
  }
  if (existing.status !== 'PENDING') {
    throw new ApiError(
      409,
      'INVALID_TRANSITION',
      'Only PENDING handovers can be confirmed (currently ' + existing.status + ').'
    );
  }
  // Custody confirmation belongs to the designated receiver, not to any
  // manager who happens to be signed in.
  if (existing.toUserId !== input.actor.id) {
    throw new ApiError(
      403,
      'NOT_RECEIVER',
      'Only the designated receiver can confirm this handover.'
    );
  }

  const shift = await prisma.shift.findUnique({
    where: { id: existing.shiftId },
    select: { businessDate: true },
  });
  if (!shift) throw new ApiError(404, 'SHIFT_NOT_FOUND', 'Shift not found.');
  await assertDayNotClosed(shift.businessDate, input.actor.role);

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