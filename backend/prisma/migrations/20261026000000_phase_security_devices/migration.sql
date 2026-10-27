-- CreateEnum
CREATE TYPE "ExpenseOrigin" AS ENUM ('MANUAL', 'KIOSK');

-- CreateEnum
CREATE TYPE "SalarySource" AS ENUM ('PAYROLL', 'KIOSK');

-- CreateEnum
CREATE TYPE "DeviceAccessStatus" AS ENUM ('ALLOWED', 'BLOCKED');

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "origin" "ExpenseOrigin" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "SalaryPayment" ADD COLUMN "source" "SalarySource" NOT NULL DEFAULT 'PAYROLL';

-- AlterTable
ALTER TABLE "SalaryAdvance" ADD COLUMN "source" "SalarySource" NOT NULL DEFAULT 'PAYROLL',
ADD COLUMN "voidedAt" TIMESTAMP(3),
ADD COLUMN "voidedBy" TEXT,
ADD COLUMN "voidReason" TEXT;

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "deviceKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DeviceAccessStatus" NOT NULL DEFAULT 'ALLOWED',
    "platform" TEXT,
    "userAgent" TEXT,
    "lastIp" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "lastUserId" TEXT,
    "createdBy" TEXT,
    "blockedAt" TIMESTAMP(3),
    "blockedBy" TEXT,
    "blockReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_deviceKey_key" ON "Device"("deviceKey");

-- CreateIndex
CREATE INDEX "Device_status_idx" ON "Device"("status");

-- CreateIndex
CREATE INDEX "Device_lastSeenAt_idx" ON "Device"("lastSeenAt");

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "deviceId" TEXT,
ADD COLUMN "deviceName" TEXT,
ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "revokedAt" TIMESTAMP(3),
ADD COLUMN "revokedBy" TEXT,
ADD COLUMN "revokedReason" TEXT;

-- CreateIndex
CREATE INDEX "Session_deviceId_idx" ON "Session"("deviceId");

-- CreateIndex
CREATE INDEX "Session_revokedAt_idx" ON "Session"("revokedAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
