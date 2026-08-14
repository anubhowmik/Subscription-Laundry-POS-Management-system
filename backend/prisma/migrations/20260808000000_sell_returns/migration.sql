-- CreateEnum
CREATE TYPE "SellReturnReason" AS ENUM ('NOT_WASHABLE', 'DAMAGED', 'NOT_FOUND', 'OTHER');

-- CreateTable
CREATE TABLE "SellReturn" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "businessLocationId" TEXT NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellReturnItem" (
    "id" TEXT NOT NULL,
    "sellReturnId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "taxPercent" DECIMAL(5,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "reason" "SellReturnReason" NOT NULL,
    "note" TEXT,

    CONSTRAINT "SellReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SellReturn_organizationId_idx" ON "SellReturn"("organizationId");

-- CreateIndex
CREATE INDEX "SellReturn_saleId_idx" ON "SellReturn"("saleId");

-- CreateIndex
CREATE INDEX "SellReturn_customerId_idx" ON "SellReturn"("customerId");

-- CreateIndex
CREATE INDEX "SellReturnItem_sellReturnId_idx" ON "SellReturnItem"("sellReturnId");

-- CreateIndex
CREATE INDEX "SellReturnItem_saleItemId_idx" ON "SellReturnItem"("saleItemId");

-- AddForeignKey
ALTER TABLE "SellReturn" ADD CONSTRAINT "SellReturn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellReturn" ADD CONSTRAINT "SellReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellReturn" ADD CONSTRAINT "SellReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellReturn" ADD CONSTRAINT "SellReturn_businessLocationId_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellReturn" ADD CONSTRAINT "SellReturn_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellReturnItem" ADD CONSTRAINT "SellReturnItem_sellReturnId_fkey" FOREIGN KEY ("sellReturnId") REFERENCES "SellReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellReturnItem" ADD CONSTRAINT "SellReturnItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

