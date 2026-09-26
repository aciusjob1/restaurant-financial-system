-- CreateEnum
CREATE TYPE "CashHandoverStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateTable
CREATE TABLE "CashHandover" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "CashHandoverStatus" NOT NULL DEFAULT 'PENDING',
    "handedOverAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "notes" TEXT,
    "confirmedNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashHandover_reconciliationId_key" ON "CashHandover"("reconciliationId");

-- CreateIndex
CREATE INDEX "CashHandover_fromUserId_idx" ON "CashHandover"("fromUserId");

-- CreateIndex
CREATE INDEX "CashHandover_toUserId_idx" ON "CashHandover"("toUserId");

-- CreateIndex
CREATE INDEX "CashHandover_status_idx" ON "CashHandover"("status");

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "Reconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
