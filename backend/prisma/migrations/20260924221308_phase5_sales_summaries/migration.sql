-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA', 'HALOPESA', 'BANK', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "SalesSummarySource" AS ENUM ('EXISTING_POS', 'MANUAL', 'IMPORT', 'FUTURE_API');

-- CreateEnum
CREATE TYPE "SalesSummaryStatus" AS ENUM ('DRAFT', 'VERIFIED');

-- CreateTable
CREATE TABLE "SalesSummary" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "source" "SalesSummarySource" NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "status" "SalesSummaryStatus" NOT NULL DEFAULT 'DRAFT',
    "totalSales" DECIMAL(14,2) NOT NULL,
    "cashSales" DECIMAL(14,2) NOT NULL,
    "mobileSales" DECIMAL(14,2) NOT NULL,
    "otherSales" DECIMAL(14,2) NOT NULL,
    "enteredBy" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesSummaryLine" (
    "id" TEXT NOT NULL,
    "salesSummaryId" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesSummaryLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesSummary_businessDate_idx" ON "SalesSummary"("businessDate");

-- CreateIndex
CREATE INDEX "SalesSummary_status_idx" ON "SalesSummary"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesSummary_source_businessDate_sourceReference_key" ON "SalesSummary"("source", "businessDate", "sourceReference");

-- CreateIndex
CREATE INDEX "SalesSummaryLine_salesSummaryId_idx" ON "SalesSummaryLine"("salesSummaryId");

-- CreateIndex
CREATE INDEX "SalesSummaryLine_paymentMethod_idx" ON "SalesSummaryLine"("paymentMethod");

-- AddForeignKey
ALTER TABLE "SalesSummaryLine" ADD CONSTRAINT "SalesSummaryLine_salesSummaryId_fkey" FOREIGN KEY ("salesSummaryId") REFERENCES "SalesSummary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
