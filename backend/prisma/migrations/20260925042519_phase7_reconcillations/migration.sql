-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWED');

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expectedCash" DECIMAL(14,2) NOT NULL,
    "expectedMobile" DECIMAL(14,2) NOT NULL,
    "actualCash" DECIMAL(14,2),
    "actualMobile" DECIMAL(14,2),
    "cashDifference" DECIMAL(14,2),
    "mobileDifference" DECIMAL(14,2),
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reconciliation_shiftId_key" ON "Reconciliation"("shiftId");

-- CreateIndex
CREATE INDEX "Reconciliation_userId_idx" ON "Reconciliation"("userId");

-- CreateIndex
CREATE INDEX "Reconciliation_status_idx" ON "Reconciliation"("status");

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
