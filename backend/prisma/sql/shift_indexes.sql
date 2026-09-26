-- Phase 4: database backstop for the "one active shift per user" rule.
-- A user may have at most one shift whose status is not CLOSED.
-- Even if two concurrent requests slip past the service-level check,
-- Postgres rejects the second INSERT.
CREATE UNIQUE INDEX IF NOT EXISTS "Shift_one_active_per_user"
  ON "Shift" ("userId")
  WHERE status IN ('OPEN', 'SUBMITTED', 'RECONCILING');