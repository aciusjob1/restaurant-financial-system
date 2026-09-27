-- Phase 19a: add required `createdById` (audit actor) to Collection and CashHandover.
--
-- Every existing row was created by the attributed user, because the services
-- rejected any other actor at creation time (see createCollection /
-- createHandover role checks in Phase 18). The backfill is therefore exact,
-- not inferred:
--
--   Collection.createdById   = Collection.userId
--   CashHandover.createdById = CashHandover.fromUserId
--
-- Chained as nullable -> backfill -> NOT NULL -> FK -> index, so the migration
-- is safe against a table with rows.

-- 1. Add nullable columns
ALTER TABLE "Collection" ADD COLUMN "createdById" TEXT;
ALTER TABLE "CashHandover" ADD COLUMN "createdById" TEXT;

-- 2. Backfill from existing attribution
UPDATE "Collection" SET "createdById" = "userId";
UPDATE "CashHandover" SET "createdById" = "fromUserId";

-- 3. Make them required
ALTER TABLE "Collection" ALTER COLUMN "createdById" SET NOT NULL;
ALTER TABLE "CashHandover" ALTER COLUMN "createdById" SET NOT NULL;

-- 4. Foreign keys to User
ALTER TABLE "Collection"
  ADD CONSTRAINT "Collection_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashHandover"
  ADD CONSTRAINT "CashHandover_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Indexes on the new FK columns
CREATE INDEX "Collection_createdById_idx" ON "Collection"("createdById");
CREATE INDEX "CashHandover_createdById_idx" ON "CashHandover"("createdById");