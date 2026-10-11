import { createHmac } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Deterministic keyed hash of a PIN, used as a fast lookup key for
 * PIN-only login. Never stored alone — always paired with an argon2
 * pinHash that is the actual credential check. The secret prevents a
 * DB-only leak from being brute-forced against a 6-digit space.
 */
export function computePinLookup(pin: string): string {
  return createHmac('sha256', env.PIN_LOOKUP_SECRET).update(pin).digest('hex');
}
