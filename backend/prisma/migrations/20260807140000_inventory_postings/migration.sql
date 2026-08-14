-- CreateEnum
CREATE TYPE "InventoryPostingStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateTable
CREATE TABLE "InventoryPosting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessLocationId" TEXT NOT NULL,
    "postingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "InventoryPostingStatus" NOT NULL DEFAULT 'PENDING',
    "cashInDrawer" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "inStockCount" INTEGER NOT NULL DEFAULT 0,
    "inStockTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "inWarehouseCount" INTEGER NOT NULL DEFAULT 0,
    "inWarehouseTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outStockCount" INTEGER NOT NULL DEFAULT 0,
    "outStockTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryPosting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryPosting_organizationId_idx" ON "InventoryPosting"("organizationId");

-- CreateIndex
CREATE INDEX "InventoryPosting_businessLocationId_idx" ON "InventoryPosting"("businessLocationId");

-- AddForeignKey
ALTER TABLE "InventoryPosting" ADD CONSTRAINT "InventoryPosting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPosting" ADD CONSTRAINT "InventoryPosting_businessLocationId_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPosting" ADD CONSTRAINT "InventoryPosting_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

