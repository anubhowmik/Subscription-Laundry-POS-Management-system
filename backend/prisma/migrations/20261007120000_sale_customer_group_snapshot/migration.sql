-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "customerGroupId" TEXT;

-- AlterTable
ALTER TABLE "SellReturn" ADD COLUMN     "customerGroupId" TEXT;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "CustomerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellReturn" ADD CONSTRAINT "SellReturn_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "CustomerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: existing sales/returns take their customer's current group (best available snapshot).
UPDATE "Sale" s SET "customerGroupId" = c."customerGroupId" FROM "Customer" c WHERE c."id" = s."customerId" AND c."customerGroupId" IS NOT NULL;
UPDATE "SellReturn" r SET "customerGroupId" = s."customerGroupId" FROM "Sale" s WHERE s."id" = r."saleId";

-- CreateIndex
CREATE INDEX "Sale_customerGroupId_idx" ON "Sale"("customerGroupId");
