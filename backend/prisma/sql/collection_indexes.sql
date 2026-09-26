-- Phase 6: partial unique index on mobile references.
--
-- Behaviour:
--   CASH + NULL reference     -> many allowed (multiple cash drops)
--   MPESA + REF123            -> one only
--   MPESA + REF123 (again)    -> rejected
--   MPESA + REF456            -> allowed
--   AIRTEL_MONEY + REF123     -> allowed (paymentMethod is part of the key)
--
-- Scoped to a single shift, so the same reference on different days is fine.
CREATE UNIQUE INDEX IF NOT EXISTS "Collection_mobile_reference_unique"
  ON "Collection" ("shiftId", "paymentMethod", "mobileReference")
  WHERE "mobileReference" IS NOT NULL;