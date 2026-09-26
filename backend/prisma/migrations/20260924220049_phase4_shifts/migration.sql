-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'SUBMITTED', 'RECONCILING', 'CLOSED');

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openingCash" DECIMAL(14,2),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shift_userId_idx" ON "Shift"("userId");

-- CreateIndex
CREATE INDEX "Shift_businessDate_idx" ON "Shift"("businessDate");

-- CreateIndex
CREATE INDEX "Shift_status_idx" ON "Shift"("status");

-- CreateIndex
CREATE INDEX "Shift_businessDate_status_idx" ON "Shift"("businessDate", "status");

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 4: database backstop for the "one active shift per user" rule.
-- A user may have at most one shift whose status is not CLOSED.
-- Even if two concurrent requests slip past the service-level check,
-- Postgres rejects the second INSERT.
CREATE UNIQUE INDEX IF NOT EXISTS "Shift_one_active_per_user"
  ON "Shift" ("userId")
  WHERE status IN ('OPEN', 'SUBMITTED', 'RECONCILING');
