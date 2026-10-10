/*
  Warnings:

  - You are about to drop the column `status` on the `SalesSummary` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[salaryPaymentId]` on the table `Expense` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[systemKey]` on the table `ExpenseCategory` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[systemKey]` on the table `MaterialCategory` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[source,businessDate,sourceReference,userId]` on the table `SalesSummary` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "ExpenseStatus" ADD VALUE 'VOID';

-- DropIndex
DROP INDEX "SalesSummary_source_businessDate_sourceReference_key";

-- DropIndex
DROP INDEX "SalesSummary_status_idx";

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "salaryPaymentId" TEXT,
ADD COLUMN     "salaryTargetEmployeeId" TEXT,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedBy" TEXT;

-- AlterTable
ALTER TABLE "ExpenseCategory" ADD COLUMN     "systemKey" TEXT;

-- AlterTable
ALTER TABLE "MaterialCategory" ADD COLUMN     "systemKey" TEXT;

-- AlterTable
ALTER TABLE "Reconciliation" ADD COLUMN     "createdBy" TEXT;

-- AlterTable
ALTER TABLE "SalesSummary" DROP COLUMN "status",
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "autoClosedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "autoApproveExpenses" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoConfirmHandovers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoReviewReconciliations" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "failedPinAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "pinSetAt" TIMESTAMP(3),
ADD COLUMN     "pinSetByUserId" TEXT;

-- DropEnum
DROP TYPE "SalesSummaryStatus";

-- CreateTable
CREATE TABLE "SalaryAdvance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "expenseId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "businessDate" DATE NOT NULL,
    "notes" TEXT,
    "recordedBy" TEXT NOT NULL,
    "settledById" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalaryAdvance_expenseId_key" ON "SalaryAdvance"("expenseId");

-- CreateIndex
CREATE INDEX "SalaryAdvance_employeeId_idx" ON "SalaryAdvance"("employeeId");

-- CreateIndex
CREATE INDEX "SalaryAdvance_settledById_idx" ON "SalaryAdvance"("settledById");

-- CreateIndex
CREATE INDEX "SalaryAdvance_employeeId_settledById_idx" ON "SalaryAdvance"("employeeId", "settledById");

-- CreateIndex
CREATE INDEX "Setting_updatedAt_idx" ON "Setting"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_salaryPaymentId_key" ON "Expense"("salaryPaymentId");

-- CreateIndex
CREATE INDEX "Expense_salaryTargetEmployeeId_idx" ON "Expense"("salaryTargetEmployeeId");

-- CreateIndex
CREATE INDEX "Expense_salaryPaymentId_idx" ON "Expense"("salaryPaymentId");

-- CreateIndex
CREATE INDEX "Expense_voidedAt_idx" ON "Expense"("voidedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_systemKey_key" ON "ExpenseCategory"("systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCategory_systemKey_key" ON "MaterialCategory"("systemKey");

-- CreateIndex
CREATE INDEX "SalesSummary_userId_idx" ON "SalesSummary"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesSummary_source_businessDate_sourceReference_userId_key" ON "SalesSummary"("source", "businessDate", "sourceReference", "userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_pinSetByUserId_fkey" FOREIGN KEY ("pinSetByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesSummary" ADD CONSTRAINT "SalesSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_salaryTargetEmployeeId_fkey" FOREIGN KEY ("salaryTargetEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_salaryPaymentId_fkey" FOREIGN KEY ("salaryPaymentId") REFERENCES "SalaryPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_voidedBy_fkey" FOREIGN KEY ("voidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryAdvance" ADD CONSTRAINT "SalaryAdvance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryAdvance" ADD CONSTRAINT "SalaryAdvance_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryAdvance" ADD CONSTRAINT "SalaryAdvance_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "SalaryRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
