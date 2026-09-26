-- CreateEnum
CREATE TYPE "SalaryStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- CreateTable
CREATE TABLE "SalaryRecord" (
    "id" TEXT NOT NULL,
    "salaryNumber" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "baseSalary" DECIMAL(14,2) NOT NULL,
    "adjustments" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "deductions" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "netSalary" DECIMAL(14,2) NOT NULL,
    "status" "SalaryStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryPayment" (
    "id" TEXT NOT NULL,
    "salaryRecordId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "businessDate" DATE NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "notes" TEXT,
    "recordedBy" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalaryRecord_salaryNumber_key" ON "SalaryRecord"("salaryNumber");

-- CreateIndex
CREATE INDEX "SalaryRecord_employeeId_idx" ON "SalaryRecord"("employeeId");

-- CreateIndex
CREATE INDEX "SalaryRecord_status_idx" ON "SalaryRecord"("status");

-- CreateIndex
CREATE INDEX "SalaryRecord_periodEnd_idx" ON "SalaryRecord"("periodEnd");

-- CreateIndex
CREATE INDEX "SalaryRecord_employeeId_status_idx" ON "SalaryRecord"("employeeId", "status");

-- CreateIndex
CREATE INDEX "SalaryRecord_employeeId_periodStart_periodEnd_idx" ON "SalaryRecord"("employeeId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "SalaryPayment_salaryRecordId_idx" ON "SalaryPayment"("salaryRecordId");

-- CreateIndex
CREATE INDEX "SalaryPayment_businessDate_idx" ON "SalaryPayment"("businessDate");

-- CreateIndex
CREATE INDEX "SalaryPayment_paymentMethod_idx" ON "SalaryPayment"("paymentMethod");

-- CreateIndex
CREATE INDEX "SalaryPayment_recordedBy_idx" ON "SalaryPayment"("recordedBy");

-- CreateIndex
CREATE INDEX "SalaryPayment_salaryRecordId_voidedAt_idx" ON "SalaryPayment"("salaryRecordId", "voidedAt");

-- AddForeignKey
ALTER TABLE "SalaryRecord" ADD CONSTRAINT "SalaryRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryRecord" ADD CONSTRAINT "SalaryRecord_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryRecord" ADD CONSTRAINT "SalaryRecord_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_salaryRecordId_fkey" FOREIGN KEY ("salaryRecordId") REFERENCES "SalaryRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_voidedBy_fkey" FOREIGN KEY ("voidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
