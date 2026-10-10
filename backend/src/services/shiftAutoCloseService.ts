import { prisma } from '../lib/prisma.js';
import { todayBusinessDate } from '../utils/businessDate.js';
import { autoCloseStaleOpenShift } from './shiftCloseService.js';

type AutoCloseResult = { closed: number; skipped: number; errors: number };

/**
 * Close every OPEN shift whose business date is strictly before today.
 * Never touches SUBMITTED or RECONCILING shifts — those need a human.
 * Never creates a reconciliation or invents cash figures.
 *
 * Called by the nightly scheduler and by the startup catch-up.
 */
export async function closeStaleOpenShiftsAll(): Promise<AutoCloseResult> {
  return runBatch({});
}

/**
 * Same as closeStaleOpenShiftsAll, but scoped to a single user.
 * Called from the login backstop so a user whose prior-day shift was
 * left OPEN can start fresh the next time they sign in.
 */
export async function closeStaleOpenShiftsForUser(
  userId: string
): Promise<AutoCloseResult> {
  return runBatch({ userId });
}

async function runBatch(filter: { userId?: string }): Promise<AutoCloseResult> {
  const today = todayBusinessDate();
  const where = {
    status: 'OPEN' as const,
    businessDate: { lt: today },
    ...(filter.userId ? { userId: filter.userId } : {}),
  };

  const stale = await prisma.shift.findMany({
    where,
    select: { id: true },
  });

  let closed = 0;
  let skipped = 0;
  let errors = 0;

  for (const s of stale) {
    try {
      const res = await autoCloseStaleOpenShift(s.id);
      if (res) closed += 1;
      else skipped += 1;
    } catch (e) {
      errors += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[autoClose] failed for shift', s.id, msg);
    }
  }

  if (closed > 0 || errors > 0) {
    console.log(
      '[autoClose] batch complete. closed=' + closed +
      ' skipped=' + skipped +
      ' errors=' + errors +
      (filter.userId ? ' user=' + filter.userId : ' (all users)')
    );
  }

  return { closed, skipped, errors };
}

