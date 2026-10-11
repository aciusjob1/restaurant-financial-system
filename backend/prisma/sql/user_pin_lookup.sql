-- Adds pinLookup to User for PIN-only login. Idempotent: safe to re-run.
--
-- pinLookup = HMAC-SHA256(PIN_LOOKUP_SECRET, pin). Used as a fast lookup
-- key so PIN-only login does not have to argon2-verify against every
-- waiter's hash. NULL until a manager sets the PIN for that waiter.
--
-- Schema-level change, created here rather than via prisma migrate dev
-- because the repo's raw SQL files are outside migration tracking.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pinLookup" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_pinLookup_key" ON "User"("pinLookup");
