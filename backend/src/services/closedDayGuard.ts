import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import type { Role } from '@prisma/client';

/**
 * Reusable closed-day wall for Phases 10-15.
 *
 * A business date is considered "locked" if there is an active DailyClosing
 * row for that date with status = CLOSED.
 *
 *   CLOSED       -> locked
 *   REOPENED     -> not locked (a correction is in progress)
 *   SUPERSEDED   -> not locked
 *
 * OWNER bypasses the wall. MANAGER / WAITER / AUDITOR receive a 409 with
 * the closing id and business date so the client can render an explanation.
 *
 * The guard never modifies the existing DailyClosing. The invariant remains:
 * a CLOSED snapshot is frozen until an explicit reopen + re-close cycle.
 */
export async function assertDayNotClosed(
  businessDate: Date,
  actorRole: Role
): Promise<void> {
  const closing = await prisma.dailyClosing.findFirst({
    where: { businessDate, status: 'CLOSED' },
    select: { id: true, businessDate: true },
  });
  if (!closing) return;
  if (actorRole === 'OWNER') return;

  throw new ApiError(
    409,
    'DAY_IS_CLOSED',
    'The business day is closed. Ask an OWNER to reopen it before making changes.',
    {
      closingId: closing.id,
      businessDate: closing.businessDate.toISOString().slice(0, 10),
    }
  );
}