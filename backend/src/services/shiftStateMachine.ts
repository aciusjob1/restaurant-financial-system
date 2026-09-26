import type { ShiftStatus, Role } from '@prisma/client';
import { ApiError } from '../errors/ApiError.js';

/**
 * Allowed state transitions for a Shift.
 *
 *   OPEN        → SUBMITTED       (owner waiter, or MANAGER/OWNER on their behalf)
 *   SUBMITTED   → RECONCILING     (MANAGER/OWNER)
 *   SUBMITTED   → OPEN            (MANAGER/OWNER sends back)
 *   RECONCILING → CLOSED          (MANAGER/OWNER)
 *   RECONCILING → SUBMITTED       (MANAGER/OWNER sends back)
 *   CLOSED      → (terminal)
 */
const ALLOWED: Record<ShiftStatus, ShiftStatus[]> = {
  OPEN: ['SUBMITTED'],
  SUBMITTED: ['RECONCILING', 'OPEN'],
  RECONCILING: ['CLOSED', 'SUBMITTED'],
  CLOSED: [],
};

const WAITER_ALLOWED: Record<ShiftStatus, ShiftStatus[]> = {
  OPEN: ['SUBMITTED'],
  SUBMITTED: [],
  RECONCILING: [],
  CLOSED: [],
};

export function canTransition(
  from: ShiftStatus,
  to: ShiftStatus,
  role: Role
): boolean {
  const table = role === 'WAITER' ? WAITER_ALLOWED : ALLOWED;
  return table[from].includes(to);
}

export function assertTransition(
  from: ShiftStatus,
  to: ShiftStatus,
  role: Role
): void {
  if (!canTransition(from, to, role)) {
    throw new ApiError(
      409,
      'INVALID_TRANSITION',
      `Cannot move shift from ${from} to ${to}.`
    );
  }
}