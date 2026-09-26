-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "DailyClosing" ADD COLUMN     "totalCashExpenses" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "totalExpenses" DECIMAL(14,2) NOT NULL DEFAULT 0.00;

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "expenseNumber" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "categoryId" TEXT NOT NULL,
    "shiftId" TEXT,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "description" TEXT NOT NULL,
    "receiptNumber" TEXT,
    "attachmentPath" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "rejectedReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE INDEX "ExpenseCategory_isActive_idx" ON "ExpenseCategory"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_expenseNumber_key" ON "Expense"("expenseNumber");

-- CreateIndex
CREATE INDEX "Expense_businessDate_idx" ON "Expense"("businessDate");

-- CreateIndex
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");

-- CreateIndex
CREATE INDEX "Expense_shiftId_idx" ON "Expense"("shiftId");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- CreateIndex
CREATE INDEX "Expense_paymentMethod_idx" ON "Expense"("paymentMethod");

-- CreateIndex
CREATE INDEX "Expense_createdBy_idx" ON "Expense"("createdBy");

-- CreateIndex
CREATE INDEX "Expense_businessDate_status_idx" ON "Expense"("businessDate", "status");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
