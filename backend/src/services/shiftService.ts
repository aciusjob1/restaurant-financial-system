import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { assertTransition } from './shiftStateMachine.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import { todayBusinessDate, parseBusinessDate, toDateOnly } from '../utils/businessDate.js';
import type { ShiftStatus, Role, Prisma } from '@prisma/client';

const ACTIVE_STATUSES: ShiftStatus[] = ['OPEN', 'SUBMITTED', 'RECONCILING'];

function serializeShift(s: {
  id: string;
  userId: string;
  businessDate: Date;
  status: ShiftStatus;
  openingCash: Prisma.Decimal | null;
  openingCashSetByUserId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  submittedAt: Date | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  closedBy: string | null;
  closedAt: Date | null;
  reopenedBy: string | null;
  reopenedAt: Date | null;
  reopenReason: string | null;
  notes: string | null;
  createdAt: Date;
  user?: { id: string; fullName: string };
}) {
  return {
    id: s.id,
    user: s.user ? { id: s.user.id, fullName: s.user.fullName } : null,
    userId: s.userId,
    businessDate: toDateOnly(s.businessDate),
    status: s.status,
    openingCash: s.openingCash === null ? null : toMoneyString(s.openingCash),
    openingCashSetByUserId: s.openingCashSetByUserId,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt ? s.endedAt.toISOString() : null,
    submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
    reviewedBy: s.reviewedBy,
    reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
    closedBy: s.closedBy,
    closedAt: s.closedAt ? s.closedAt.toISOString() : null,
    reopenedBy: s.reopenedBy,
    reopenedAt: s.reopenedAt ? s.reopenedAt.toISOString() : null,
    reopenReason: s.reopenReason,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
  };
}

export async function listShifts(opts: {
  actor: { id: string; role: Role };
  userId?: string;
  status?: ShiftStatus;
  businessDate?: string;
}) {
  const where: Prisma.ShiftWhereInput = {};

  if (opts.actor.role === 'WAITER') {
    where.userId = opts.actor.id;
  } else if (opts.userId) {
    where.userId = opts.userId;
  }

  if (opts.status) where.status = opts.status;
  if (opts.businessDate) where.businessDate = parseBusinessDate(opts.businessDate);

  const rows = await prisma.shift.findMany({
    where,
    orderBy: [{ businessDate: 'desc' }, { startedAt: 'desc' }],
    take: 200,
    include: { user: { select: { id: true, fullName: true } } },
  });
  return rows.map(serializeShift);
}

export async function getShiftById(id: string, actor: { id: string; role: Role }) {
  const row = await prisma.shift.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Shift not found.');
  if (actor.role === 'WAITER' && row.userId !== actor.id) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission.');
  }
  return serializeShift(row);
}

/**
 * Auto-opens today's shift for a user if none exists. Idempotent:
 * returns the existing open shift if one is already there. Called from
 * collection / handover / reconciliation / sales write paths so nobody
 * has to manually open a shift.
 */
export async function ensureOpenShiftForUserAndDate(
  userId: string,
  businessDate: Date
) {
  // Same-day check first — the common case. If a shift already exists
  // for this user on this business date, reuse it.
  const sameDay = await prisma.shift.findFirst({
    where: { userId, businessDate },
  });
  if (sameDay) return sameDay;

  // If the user has an active shift on a DIFFERENT business date, they
  // need to close it before we can open a new one for today. The partial
  // unique index Shift_one_active_per_user enforces this at the DB level;
  // we check here so the caller gets a specific 409 instead of a raw P2002.
  const priorActive = await prisma.shift.findFirst({
    where: {
      userId,
      status: { in: ['OPEN', 'SUBMITTED', 'RECONCILING'] },
    },
    select: { id: true, businessDate: true, status: true },
  });
  if (
    priorActive &&
    toDateOnly(priorActive.businessDate) !== toDateOnly(businessDate)
  ) {
    throw new ApiError(
      409,
      'PRIOR_SHIFT_STILL_OPEN',
      'A shift from ' +
        toDateOnly(priorActive.businessDate) +
        ' is still ' +
        priorActive.status +
        '. Close it before starting a new one for ' +
        toDateOnly(businessDate) +
        '.'
    );
  }

  try {
    return await prisma.shift.create({
      data: {
        userId,
        businessDate,
        status: 'OPEN',
        openingCash: null,
        notes: 'Auto-opened on first entry of the day.',
      },
    });
  } catch (err) {
    // Race: another request created it between find and create.
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      const row = await prisma.shift.findFirst({ where: { userId, businessDate } });
      if (row) return row;
    }
    throw err;
  }
}

export async function startShift(input: {
  actor: { id: string; role: Role };
  businessDate?: string;
  openingCash?: string;
  notes?: string | null;
  onBehalfOfUserId?: string;
}) {
  const businessDate = input.businessDate
    ? parseBusinessDate(input.businessDate)
    : todayBusinessDate();

  // MANAGER/OWNER opens the day's shift, optionally on behalf of a WAITER.
  // Route-level requireRole blocks WAITER entirely.
  let userId = input.actor.id;
  if (input.onBehalfOfUserId !== undefined) {
    if (input.actor.role !== 'MANAGER' && input.actor.role !== 'OWNER') {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Only MANAGER or OWNER can open a shift on behalf of another user.'
      );
    }
    const target = await prisma.user.findUnique({
      where: { id: input.onBehalfOfUserId },
      select: { id: true, role: true, isActive: true },
    });
    if (!target) {
      throw new ApiError(400, 'INVALID_ON_BEHALF_USER', 'Target user does not exist.');
    }
    if (!target.isActive) {
      throw new ApiError(400, 'INVALID_ON_BEHALF_USER', 'Target user is not active.');
    }
    if (target.role !== 'WAITER') {
      throw new ApiError(400, 'INVALID_ON_BEHALF_USER', 'Target user must be a WAITER.');
    }
    userId = input.onBehalfOfUserId;
  }

  // One shift per user per business date. The manual start endpoint still
  // exists for the pre-declared-float case, but auto-open covers the
  // normal path — see ensureOpenShiftForUserAndDate().
  const existing = await prisma.shift.findFirst({
    where: { userId, businessDate },
  });
  if (existing) {
    throw new ApiError(
      409,
      'SHIFT_ALREADY_OPEN',
      'You already have a shift for this business date. Close it before starting another.'
    );
  }

  try {
    const row = await prisma.shift.create({
      data: {
        userId,
        businessDate,
        status: 'OPEN',
        openingCash:
          input.openingCash !== undefined ? toDecimal(input.openingCash) : null,
        notes: input.notes ?? null,
      },
    });
    return serializeShift(row);
  } catch (err) {
    // Backstop: the partial unique index may fire under concurrent requests.
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
      throw new ApiError(
        409,
        'SHIFT_ALREADY_OPEN',
        'A shift already exists for this business date. Close it before starting another.'
      );
    }
    throw err;
  }
}

export async function setOpeningCash(input: {
  id: string;
  actor: { id: string; role: Role };
  openingCash: string;
}) {
  const existing = await prisma.shift.findUnique({ where: { id: input.id } });
  if (!existing) {
    throw new ApiError(404, 'SHIFT_NOT_FOUND', 'Shift does not exist.');
  }
  if (existing.status !== 'OPEN') {
    throw new ApiError(409, 'SHIFT_NOT_OPEN', 'Opening cash can only be declared on an OPEN shift.');
  }
  if (existing.openingCash !== null) {
    throw new ApiError(409, 'OPENING_CASH_ALREADY_SET', 'Opening cash has already been declared for this shift.');
  }

  const row = await prisma.shift.update({
    where: { id: input.id },
    data: {
      openingCash: toDecimal(input.openingCash),
      openingCashSetByUserId: input.actor.id,
    },
  });
  return serializeShift(row);
}

export async function transitionShift(input: {
  shiftId: string;
  actor: { id: string; role: Role };
  to: ShiftStatus;
  reason?: string;
}) {
  const row = await prisma.shift.findUnique({ where: { id: input.shiftId } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Shift not found.');

  // Ownership: a waiter can only act on their own shift.
  if (input.actor.role === 'WAITER' && row.userId !== input.actor.id) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission.');
  }

  // State machine: role-aware.
  assertTransition(row.status, input.to, input.actor.role);

  // Business rule: a shift may not leave OPEN without openingCash declared.
  if (row.status === 'OPEN' && input.to === 'SUBMITTED' && row.openingCash === null) {
    throw new ApiError(
      409,
      'OPENING_CASH_REQUIRED',
      'Declare opening cash before submitting the shift.'
    );
  }

  const now = new Date();
  const data: Prisma.ShiftUpdateInput = { status: input.to };

  if (input.to === 'SUBMITTED') {
    data.submittedAt = now;
  }
  if (input.to === 'OPEN') {
    // send-back: clear the submit marker
    data.submittedAt = null;
  }
  if (input.to === 'RECONCILING') {
    data.reviewedBy = input.actor.id;
    data.reviewedAt = now;
  }
  if (input.to === 'CLOSED') {
    data.closedBy = input.actor.id;
    data.closedAt = now;
    data.endedAt = now;
  }

  const updated = await prisma.shift.update({
    where: { id: input.shiftId },
    data,
  });
  return serializeShift(updated);
}
