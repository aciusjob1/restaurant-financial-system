-- Phase 19c: CashHandover becomes independent of Reconciliation.
--
-- Chained nullable -> backfill -> NOT NULL -> FK -> index. Also drops
-- the 1:1 unique on reconciliationId and makes it nullable, so the row
-- can exist without a recon. Adds a void path.
--
-- Backfill is exact: every existing handover's recon.shiftId is the
-- shift the handover belongs to. Verified pre-migration: 0 orphans.

-- 1. Add shiftId nullable
ALTER TABLE "CashHandover" ADD COLUMN "shiftId" TEXT;

-- 2. Backfill from the reconciliation each handover was tied to
UPDATE "CashHandover" h
SET "shiftId" = r."shiftId"
FROM "Reconciliation" r
WHERE h."reconciliationId" = r."id";

-- 3. Guard: abort if any row still has NULL shiftId
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count FROM "CashHandover" WHERE "shiftId" IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Phase 19c backfill failed: % handover rows still have NULL shiftId', null_count;
  END IF;
END $$;

-- 4. Make shiftId required
ALTER TABLE "CashHandover" ALTER COLUMN "shiftId" SET NOT NULL;

-- 5. Drop the 1:1 unique on reconciliationId
DROP INDEX "CashHandover_reconciliationId_key";

-- 6. Make reconciliationId optional
ALTER TABLE "CashHandover" ALTER COLUMN "reconciliationId" DROP NOT NULL;

-- 7. FK for shiftId (mirrors existing FK behavior)
ALTER TABLE "CashHandover"
  ADD CONSTRAINT "CashHandover_shiftId_fkey"
  FOREIGN KEY ("shiftId") REFERENCES "Shift"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8. Indexes: shiftId and reconciliationId
CREATE INDEX "CashHandover_shiftId_idx" ON "CashHandover"("shiftId");
CREATE INDEX "CashHandover_reconciliationId_idx" ON "CashHandover"("reconciliationId");

-- 9. Void fields
ALTER TABLE "CashHandover" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "CashHandover" ADD COLUMN "voidedBy" TEXT;
ALTER TABLE "CashHandover" ADD COLUMN "voidReason" TEXT;

-- 10. voidedBy FK + index
ALTER TABLE "CashHandover"
  ADD CONSTRAINT "CashHandover_voidedBy_fkey"
  FOREIGN KEY ("voidedBy") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "CashHandover_voidedBy_idx" ON "CashHandover"("voidedBy");