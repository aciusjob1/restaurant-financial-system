-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'OPENING', 'CONSUMPTION', 'WASTE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "StockMovementDirection" AS ENUM ('IN', 'OUT');

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "currentStock" DECIMAL(14,3) NOT NULL DEFAULT 0.000;

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "materialId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "direction" "StockMovementDirection" NOT NULL,
    "businessDate" DATE NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2),
    "totalCost" DECIMAL(14,2),
    "purchaseItemId" TEXT,
    "reversalOfId" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_sequence_key" ON "StockMovement"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_purchaseItemId_key" ON "StockMovement"("purchaseItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_reversalOfId_key" ON "StockMovement"("reversalOfId");

-- CreateIndex
CREATE INDEX "StockMovement_materialId_businessDate_idx" ON "StockMovement"("materialId", "businessDate");

-- CreateIndex
CREATE INDEX "StockMovement_type_idx" ON "StockMovement"("type");

-- CreateIndex
CREATE INDEX "StockMovement_businessDate_idx" ON "StockMovement"("businessDate");

-- CreateIndex
CREATE INDEX "StockMovement_createdBy_idx" ON "StockMovement"("createdBy");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
