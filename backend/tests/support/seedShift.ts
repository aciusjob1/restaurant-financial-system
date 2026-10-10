import { prisma } from '../../src/lib/prisma.js';

type SeedUser = { username: string };

type SeedOpts = {
  businessDate?: string | Date;
  openingCash?: string | null;
  status?: 'OPEN' | 'SUBMITTED' | 'RECONCILING' | 'CLOSED';
};

export type SeededShift = {
  id: string;
  userId: string;
  businessDate: Date;
  status: string;
};

function todayAsDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * Seed a shift directly via Prisma. Replaces the removed
 * POST /api/v1/shifts endpoint. Tests that need a shift to exist as a
 * precondition for something else use this; tests that were verifying
 * the removed endpoint's behavior have been deleted.
 *
 * Defaults: businessDate = server-tz today, openingCash = '0.00',
 * status = 'OPEN'. Pass null for openingCash to seed a legacy-shaped
 * row without it.
 */
export async function seedShiftForUser(
  user: SeedUser,
  opts: SeedOpts = {}
): Promise<SeededShift> {
  const u = await prisma.user.findUniqueOrThrow({ where: { username: user.username } });

  const businessDate =
    opts.businessDate === undefined
      ? todayAsDate()
      : typeof opts.businessDate === 'string'
        ? new Date(opts.businessDate + 'T00:00:00.000Z')
        : opts.businessDate;

  const shift = await prisma.shift.create({
    data: {
      userId: u.id,
      businessDate,
      status: opts.status ?? 'OPEN',
      openingCash: opts.openingCash === undefined ? '0.00' : opts.openingCash,
    },
  });

  return {
    id: shift.id,
    userId: shift.userId,
    businessDate: shift.businessDate,
    status: shift.status,
  };
}
