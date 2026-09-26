-- CreateEnum
CREATE TYPE "DailyClosingStatus" AS ENUM ('CLOSED', 'SUPERSEDED', 'REOPENED');

-- CreateTable
CREATE TABLE "DailyClosing" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "DailyClosingStatus" NOT NULL DEFAULT 'CLOSED',
    "salesSummaryTotal" DECIMAL(14,2) NOT NULL,
    "salesSummaryCash" DECIMAL(14,2) NOT NULL,
    "salesSummaryMobile" DECIMAL(14,2) NOT NULL,
    "salesSummaryOther" DECIMAL(14,2) NOT NULL,
    "expectedCash" DECIMAL(14,2) NOT NULL,
    "expectedMobile" DECIMAL(14,2) NOT NULL,
    "actualCash" DECIMAL(14,2) NOT NULL,
    "actualMobile" DECIMAL(14,2) NOT NULL,
    "cashDifference" DECIMAL(14,2) NOT NULL,
    "mobileDifference" DECIMAL(14,2) NOT NULL,
    "cashSalesDiscrepancy" DECIMAL(14,2) NOT NULL,
    "mobileSalesDiscrepancy" DECIMAL(14,2) NOT NULL,
    "otherSalesDiscrepancy" DECIMAL(14,2) NOT NULL,
    "totalHandovers" INTEGER NOT NULL,
    "totalHandoverAmount" DECIMAL(14,2) NOT NULL,
    "pendingHandoverCount" INTEGER NOT NULL,
    "pendingHandoverAmount" DECIMAL(14,2) NOT NULL,
    "confirmedHandoverCount" INTEGER NOT NULL,
    "confirmedHandoverAmount" DECIMAL(14,2) NOT NULL,
    "shiftCount" INTEGER NOT NULL,
    "reconciliationCount" INTEGER NOT NULL,
    "pendingReviewCount" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "closedBy" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reopenedBy" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyClosing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyClosing_businessDate_idx" ON "DailyClosing"("businessDate");

-- CreateIndex
CREATE INDEX "DailyClosing_status_idx" ON "DailyClosing"("status");

-- CreateIndex
CREATE INDEX "DailyClosing_businessDate_status_idx" ON "DailyClosing"("businessDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyClosing_businessDate_version_key" ON "DailyClosing"("businessDate", "version");

-- AddForeignKey
ALTER TABLE "DailyClosing" ADD CONSTRAINT "DailyClosing_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyClosing" ADD CONSTRAINT "DailyClosing_reopenedBy_fkey" FOREIGN KEY ("reopenedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
