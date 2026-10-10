-- Adds waiter PIN columns to User. Idempotent: safe to re-run.
--
-- Columns:
--   pinHash            argon2id hash of a 6-digit PIN; NULL until set
--   pinSetByUserId     who assigned the PIN (manager/owner); NULL for
--                      self-set PINs and pre-existing rows
--   pinSetAt           when the PIN was assigned
--   failedPinAttempts  consecutive failed attempts since last success
--   lockedUntil        if set and in the future, PIN login is rejected
--
-- The self-relation FK on pinSetByUserId is nullable; onDelete SET NULL
-- so removing the assigner does not delete the assignee.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pinHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pinSetByUserId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pinSetAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedPinAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_pinSetByUserId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_pinSetByUserId_fkey"
  FOREIGN KEY ("pinSetByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "User_pinSetByUserId_idx"
  ON "User"("pinSetByUserId");
