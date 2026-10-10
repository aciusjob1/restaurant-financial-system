-- Adds autoClosedAt to Shift. Idempotent: safe to re-run.
ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "autoClosedAt" TIMESTAMP(3);
