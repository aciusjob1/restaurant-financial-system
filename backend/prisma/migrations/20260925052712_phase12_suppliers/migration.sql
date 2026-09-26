-- CreateEnum
CREATE TYPE "PurchaseInvoiceStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "supplierNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "contactPerson" TEXT,
    "tin" TEXT,
    "paymentTerms" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "businessDate" DATE NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "status" "PurchaseInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "postedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "recordedBy" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "supplierPaymentId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_supplierNumber_key" ON "Supplier"("supplierNumber");

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");

-- CreateIndex
CREATE INDEX "Supplier_isActive_idx" ON "Supplier"("isActive");

-- CreateIndex
CREATE INDEX "Supplier_phone_idx" ON "Supplier"("phone");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_supplierId_idx" ON "PurchaseInvoice"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_businessDate_idx" ON "PurchaseInvoice"("businessDate");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_status_idx" ON "PurchaseInvoice"("status");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_date_idx" ON "PurchaseInvoice"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_supplierId_invoiceNumber_key" ON "PurchaseInvoice"("supplierId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayment_paymentNumber_key" ON "SupplierPayment"("paymentNumber");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierId_idx" ON "SupplierPayment"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierPayment_businessDate_idx" ON "SupplierPayment"("businessDate");

-- CreateIndex
CREATE INDEX "SupplierPayment_paymentMethod_idx" ON "SupplierPayment"("paymentMethod");

-- CreateIndex
CREATE INDEX "SupplierPayment_recordedBy_idx" ON "SupplierPayment"("recordedBy");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierId_voidedAt_idx" ON "SupplierPayment"("supplierId", "voidedAt");

-- CreateIndex
CREATE INDEX "PaymentAllocation_supplierPaymentId_idx" ON "PaymentAllocation"("supplierPaymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_purchaseInvoiceId_idx" ON "PaymentAllocation"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_purchaseInvoiceId_voidedAt_idx" ON "PaymentAllocation"("purchaseInvoiceId", "voidedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_supplierPaymentId_purchaseInvoiceId_key" ON "PaymentAllocation"("supplierPaymentId", "purchaseInvoiceId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_postedBy_fkey" FOREIGN KEY ("postedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_cancelledBy_fkey" FOREIGN KEY ("cancelledBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_voidedBy_fkey" FOREIGN KEY ("voidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_voidedBy_fkey" FOREIGN KEY ("voidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
