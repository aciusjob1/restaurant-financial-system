import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { ApiError } from '../errors/ApiError.js';
import { computePinLookup } from '../lib/pinLookup.js';
import type { Role } from '@prisma/client';

// A real Argon2id hash, computed once at module load. Used only when the
// username doesn't exist, so the code path runs the same Argon2 verify
// (and therefore takes the same time) regardless of whether the user exists.
// This is what closes the user-enumeration timing side-channel.
const DUMMY_PASSWORD = 'this-is-not-a-real-password-4f8a1c9b';
let DUMMY_HASH: string | null = null;

async function getDummyHash(): Promise<string> {
  if (!DUMMY_HASH) {
    DUMMY_HASH = await hashPassword(DUMMY_PASSWORD);
  }
  return DUMMY_HASH;
}

export async function authenticateUser(params: { username: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { username: params.username } });
  const hash = user?.passwordHash ?? (await getDummyHash());
  const ok = await verifyPassword(hash, params.password);

  if (!user || !ok) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password.');
  }
  if (!user.isActive) {
    throw new ApiError(403, 'ACCOUNT_DISABLED', 'Account is disabled.');
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
  return user;
}

// ── PIN authentication ────────────────────────────────────────
//
// Lockout policy: 5 consecutive failed attempts, then 15 minutes locked.
// The threshold and duration are duplicated in the SQL below and here.
// Any change to the threshold must be made in both places.
const PIN_LOCKOUT_THRESHOLD = 5;
const PIN_LOCKOUT_MINUTES = 15;

/**
 * Atomically record one failed PIN attempt for a user. Single SQL statement;
 * Postgres locks the row for the duration of the UPDATE, so concurrent calls
 * cannot lose increments or race past the threshold.
 *
 * Three cases, in this order:
 *
 *   1. Actively locked (lockedUntil > NOW):
 *        The counter and the lock timestamp are preserved unchanged. A wrong
 *        PIN while locked is a no-op on this row — it does not extend the
 *        lock and does not inflate the counter. This is the "actively
 *        locked, wrong attempt" invariant the concurrency tests assert.
 *
 *   2. Expired lock (lockedUntil <= NOW, non-null):
 *        The lock has lifted but the counter is still at or above the
 *        threshold. A fresh wrong attempt starts a NEW cycle: counter = 1,
 *        lockout cleared. Prevents the "got locked, waited 15 minutes,
 *        typed wrong PIN, immediately locked again" pathology.
 *
 *   3. Fresh or attempting (lockedUntil IS NULL):
 *        Counter increments. If the new value reaches the threshold, the
 *        lock is set to now + PIN_LOCKOUT_MINUTES; otherwise the account
 *        remains unlocked.
 */
async function recordFailedPinAttempt(userId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "User"
     SET
       "failedPinAttempts" = CASE
         WHEN "lockedUntil" IS NOT NULL AND "lockedUntil" > NOW()
           THEN "failedPinAttempts"
         WHEN "lockedUntil" IS NOT NULL AND "lockedUntil" <= NOW()
           THEN 1
         ELSE "failedPinAttempts" + 1
       END,
       "lockedUntil" = CASE
         WHEN "lockedUntil" IS NOT NULL AND "lockedUntil" > NOW()
           THEN "lockedUntil"
         WHEN "lockedUntil" IS NOT NULL AND "lockedUntil" <= NOW()
           THEN NULL
         WHEN "failedPinAttempts" + 1 >= $1
           THEN NOW() + ($2 || ' minutes')::interval
         ELSE NULL
       END
     WHERE id = $3`,
    PIN_LOCKOUT_THRESHOLD,
    PIN_LOCKOUT_MINUTES,
    userId
  );
}

/**
 * Authenticate a waiter by 6-digit PIN. Uniform response for every failure
 * mode: unknown username, no PIN configured, wrong PIN, locked account,
 * inactive account, non-WAITER role. Same 401, same body, same timing.
 *
 * The lockout check is not a read-then-check. The success path uses a single
 * conditional UPDATE that resets the counter only if the row is currently
 * unlocked. If another request locked the account between our read and this
 * write, the update affects 0 rows and we reject uniformly. No race window.
 */
export async function authenticateByPin(params: { username: string; pin: string }) {
  const user = await prisma.user.findUnique({ where: { username: params.username } });

  // Timing-safe: always run one argon2 verify, even when the user is unknown
  // or has no PIN set. Closes the user-enumeration side channel.
  const hash = user?.pinHash ?? (await getDummyHash());
  const ok = await verifyPassword(hash, params.pin);

  if (!user || !user.pinHash || !ok) {
    if (user) {
      await recordFailedPinAttempt(user.id);
    }
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or PIN.');
  }

  // Atomic success path. The UPDATE only fires if the row is not currently
  // locked, is active, and is a WAITER. If any of those fails at the moment
  // of the write — including a concurrent lock from another request — the
  // update affects 0 rows and we reject.
  const result = await prisma.user.updateMany({
    where: {
      id: user.id,
      role: 'WAITER',
      isActive: true,
      OR: [
        { lockedUntil: null },
        { lockedUntil: { lte: new Date() } },
      ],
    },
    data: {
      failedPinAttempts: 0,
      lockedUntil: null,
      lastLogin: new Date(),
    },
  });

  if (result.count === 0) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or PIN.');
  }

  // Re-read to return the current row (post-update) with lastLogin set.
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  return updated;
}

/**
 * Authenticate a waiter by 6-digit PIN alone. Same uniform 401 for every
 * failure mode as authenticateByPin, but the lookup key is a keyed HMAC
 * of the PIN rather than the username — this is what makes PIN-only
 * possible without iterating argon2 hashes.
 *
 * Wrong PINs touch no user row: the HMAC resolves to no user, and we
 * return uniform 401 without incrementing any counter. This means
 * PIN-only login cannot be used to lock a waiter out. Rate limiting
 * on the route is the only abuse defense, which is why it's tighter
 * than the username+pin limiter.
 *
 * Timing: unknown PIN runs a dummy argon2 verify so the response does
 * not distinguish "PIN belongs to nobody" from "PIN belongs to a
 * locked user."
 */
export async function authenticateByPinOnly(params: { pin: string }) {
  const lookup = computePinLookup(params.pin);

  const user = await prisma.user.findFirst({
    where: { pinLookup: lookup, role: 'WAITER', isActive: true },
  });

  if (!user || !user.pinHash) {
    await verifyPassword(await getDummyHash(), params.pin);
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid PIN.');
  }

  // Defense in depth: the HMAC match alone isn't the credential check.
  // If both the DB and PIN_LOOKUP_SECRET leaked, this argon2 verify is
  // what still stops a forged lookup.
  const ok = await verifyPassword(user.pinHash, params.pin);
  if (!ok) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid PIN.');
  }

  // Atomic success path. Same shape as authenticateByPin: clears the
  // counter and lock only if the row is still unlocked and active at
  // the moment of the write.
  const result = await prisma.user.updateMany({
    where: {
      id: user.id,
      role: 'WAITER',
      isActive: true,
      OR: [
        { lockedUntil: null },
        { lockedUntil: { lte: new Date() } },
      ],
    },
    data: {
      failedPinAttempts: 0,
      lockedUntil: null,
      lastLogin: new Date(),
    },
  });

  if (result.count === 0) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid PIN.');
  }

  const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  return updated;
}

export async function changePassword(params: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}) {
  const user = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found.');

  const ok = await verifyPassword(user.passwordHash, params.currentPassword);
  if (!ok) throw new ApiError(400, 'INVALID_PASSWORD', 'Current password is incorrect.');

  const passwordHash = await hashPassword(params.newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  return true;
}

export async function updateMyProfile(
  userId: string,
  input: {
    fullName?: string;
    phone?: string | null;
    language?: string | null;
    autoApproveExpenses?: boolean;
    autoReviewReconciliations?: boolean;
    autoConfirmHandovers?: boolean;
  }
) {
  const data: {
    fullName?: string;
    phone?: string | null;
    language?: string | null;
    autoApproveExpenses?: boolean;
    autoReviewReconciliations?: boolean;
    autoConfirmHandovers?: boolean;
  } = {};
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.language !== undefined) data.language = input.language;
  if (input.autoApproveExpenses !== undefined) data.autoApproveExpenses = input.autoApproveExpenses;
  if (input.autoReviewReconciliations !== undefined) data.autoReviewReconciliations = input.autoReviewReconciliations;
  if (input.autoConfirmHandovers !== undefined) data.autoConfirmHandovers = input.autoConfirmHandovers;

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      username: true,
      fullName: true,
      phone: true,
      language: true,
      role: true,
      isActive: true,
      autoApproveExpenses: true,
      autoReviewReconciliations: true,
      autoConfirmHandovers: true,
    },
  });
  return user;
}

/**
 * Assign or reset a waiter's PIN. Only OWNER and MANAGER may call this.
 * The PIN itself is never returned, never logged, and never stored outside
 * the argon2 hash. The actor who set the PIN is recorded in pinSetByUserId
 * for audit.
 */
export async function setPin(params: {
  actorId: string;
  actorRole: Role;
  targetUserId: string;
  pin: string;
}): Promise<{ id: string; username: string }> {
  if (params.actorRole !== 'OWNER' && params.actorRole !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can set PINs.');
  }

  const target = await prisma.user.findUnique({ where: { id: params.targetUserId } });
  if (!target) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found.');
  if (target.role !== 'WAITER') {
    throw new ApiError(400, 'PIN_ONLY_FOR_WAITERS', 'PINs are only for waiters.');
  }

  const pinHash = await hashPassword(params.pin);
  const pinLookup = computePinLookup(params.pin);

  try {
    await prisma.user.update({
      where: { id: target.id },
      data: {
        pinHash,
        pinLookup,
        pinSetByUserId: params.actorId,
        pinSetAt: new Date(),
        failedPinAttempts: 0,
        lockedUntil: null,
      },
    });
  } catch (e) {
    // Unique violation on pinLookup: another active waiter already has this PIN.
    if ((e as { code?: string })?.code === 'P2002') {
      throw new ApiError(409, 'PIN_ALREADY_IN_USE', 'That PIN is already in use.');
    }
    throw e;
  }

  // Never return the PIN or its hash.
  return { id: target.id, username: target.username };
}
