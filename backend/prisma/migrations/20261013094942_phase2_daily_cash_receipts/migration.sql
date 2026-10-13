-- CreateEnum
CREATE TYPE "DailyCashStatus" AS ENUM ('PENDING', 'APPROVED', 'INSUFFICIENT', 'NO_NETCASH_HANDED_OVER');

-- CreateTable
CREATE TABLE "DailyCashReceipt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" "DailyCashStatus" NOT NULL DEFAULT 'PENDING',
    "amountReceived" DECIMAL(14,2),
    "submissionFingerprint" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCashReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCashReceiptDecision" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "status" "DailyCashStatus" NOT NULL,
    "amountReceived" DECIMAL(14,2),
    "decidedBy" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invalidatedAt" TIMESTAMP(3),
    "invalidatedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyCashReceiptDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyCashReceipt_businessDate_idx" ON "DailyCashReceipt"("businessDate");

-- CreateIndex
CREATE INDEX "DailyCashReceipt_status_idx" ON "DailyCashReceipt"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCashReceipt_userId_businessDate_key" ON "DailyCashReceipt"("userId", "businessDate");

-- CreateIndex
CREATE INDEX "DailyCashReceiptDecision_receiptId_idx" ON "DailyCashReceiptDecision"("receiptId");

-- CreateIndex
CREATE INDEX "DailyCashReceiptDecision_decidedAt_idx" ON "DailyCashReceiptDecision"("decidedAt");

-- AddForeignKey
ALTER TABLE "DailyCashReceipt" ADD CONSTRAINT "DailyCashReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCashReceipt" ADD CONSTRAINT "DailyCashReceipt_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCashReceipt" ADD CONSTRAINT "DailyCashReceipt_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCashReceiptDecision" ADD CONSTRAINT "DailyCashReceiptDecision_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "DailyCashReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCashReceiptDecision" ADD CONSTRAINT "DailyCashReceiptDecision_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
