-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mobileReference" TEXT,
    "notes" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Collection_shiftId_idx" ON "Collection"("shiftId");

-- CreateIndex
CREATE INDEX "Collection_userId_idx" ON "Collection"("userId");

-- CreateIndex
CREATE INDEX "Collection_paymentMethod_idx" ON "Collection"("paymentMethod");

-- CreateIndex
CREATE INDEX "Collection_shiftId_paymentMethod_idx" ON "Collection"("shiftId", "paymentMethod");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
