-- Phase 6: partial unique index on mobile references.
--
-- Behaviour:
--   CASH + NULL reference           -> many allowed (multiple cash drops)
--   MPESA + REF123                  -> one active only
--   MPESA + REF123 (again, active)  -> rejected
--   MPESA + REF456                  -> allowed
--   AIRTEL_MONEY + REF123           -> allowed (paymentMethod is part of the key)
--   MPESA + REF123 (voided)         -> does NOT block a resubmission
--
-- Scoped to a single shift, so the same reference on different days is fine.
--
-- The voidedAt IS NULL predicate is essential: a resubmission that voids
-- an actor's prior row and creates a fresh one with the same payer name
-- must succeed. Without this predicate, voiding a row would permanently
-- occupy the (shiftId, paymentMethod, mobileReference) slot and any
-- legitimate replacement would 409 forever.
--
-- Idempotent: DROP IF EXISTS + CREATE IF NOT EXISTS. The DROP is required
-- because an older version of this index (without the voidedAt predicate)
-- may already exist; CREATE IF NOT EXISTS would be a silent no-op in that
-- case, leaving the broken predicate in place.

DROP INDEX IF EXISTS "Collection_mobile_reference_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "Collection_mobile_reference_unique"
  ON "Collection" ("shiftId", "paymentMethod", "mobileReference")
  WHERE "mobileReference" IS NOT NULL AND "voidedAt" IS NULL;