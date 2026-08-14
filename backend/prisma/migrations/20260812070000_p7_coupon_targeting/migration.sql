-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "businessLocationId" TEXT,
ADD COLUMN     "customerGroupId" TEXT,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "maxDiscountAmount" DECIMAL(12,2),
ADD COLUMN     "maxUsesPerCustomer" INTEGER;

-- CreateIndex
CREATE INDEX "Coupon_businessLocationId_idx" ON "Coupon"("businessLocationId");

-- CreateIndex
CREATE INDEX "Coupon_customerId_idx" ON "Coupon"("customerId");

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_businessLocationId_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "CustomerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

