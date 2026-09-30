-- CreateEnum
CREATE TYPE "InventoryPostingSaleStatus" AS ENUM ('IN_STOCK', 'OUT_STOCK', 'IN_WAREHOUSE');

-- AlterTable: drop the old auto-computed snapshot columns, add the manual-classification search fields
ALTER TABLE "InventoryPosting"
  DROP COLUMN "inStockCount",
  DROP COLUMN "inStockTotal",
  DROP COLUMN "inWarehouseCount",
  DROP COLUMN "inWarehouseTotal",
  DROP COLUMN "outStockCount",
  DROP COLUMN "outStockTotal",
  ADD COLUMN "employeeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "searchDateFrom" TIMESTAMP(3),
  ADD COLUMN "searchDateTo" TIMESTAMP(3),
  ADD COLUMN "reconciledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InventoryPostingSale" (
    "id" TEXT NOT NULL,
    "inventoryPostingId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "status" "InventoryPostingSaleStatus" NOT NULL,

    CONSTRAINT "InventoryPostingSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryPostingSale_saleId_idx" ON "InventoryPostingSale"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryPostingSale_inventoryPostingId_saleId_key" ON "InventoryPostingSale"("inventoryPostingId", "saleId");

-- AddForeignKey
ALTER TABLE "InventoryPostingSale" ADD CONSTRAINT "InventoryPostingSale_inventoryPostingId_fkey" FOREIGN KEY ("inventoryPostingId") REFERENCES "InventoryPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPostingSale" ADD CONSTRAINT "InventoryPostingSale_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
