/**
 * Pure session-expiry rules. Kept free of prisma/env imports so the rules
 * can be unit-tested without a database.
 *
 * Policy (financial system):
 *  - Sliding idle window: a session whose last activity is older than
 *    `idleHours` is dead, no matter what the row's expiresAt says.
 *  - Absolute cap: a session never lives longer than `maxAgeHours` from
 *    the moment of login, no matter how active it is.
 *  - The row's expiresAt remains the fast-path check used on every
 *    request; idle/age are evaluated against lastSeenAt/createdAt.
 */

export type SessionVerdict =
  | { kind: 'OK' }
  | { kind: 'EXPIRED' }
  | { kind: 'IDLE_TIMEOUT' }
  | { kind: 'MAX_AGE' };

const HOUR_MS = 60 * 60 * 1000;

export function evaluateSession(input: {
  nowMs: number;
  expiresAtMs: number;
  lastSeenAtMs: number;
  createdAtMs: number;
  idleHours: number;
  maxAgeHours: number;
}): SessionVerdict {
  if (input.expiresAtMs <= input.nowMs) return { kind: 'EXPIRED' };
  if (input.createdAtMs + input.maxAgeHours * HOUR_MS <= input.nowMs) {
    return { kind: 'MAX_AGE' };
  }
  if (input.lastSeenAtMs + input.idleHours * HOUR_MS <= input.nowMs) {
    return { kind: 'IDLE_TIMEOUT' };
  }
  return { kind: 'OK' };
}
