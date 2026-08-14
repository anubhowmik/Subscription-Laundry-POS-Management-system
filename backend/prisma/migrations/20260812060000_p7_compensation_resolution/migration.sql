-- CreateEnum
CREATE TYPE "CompensationResolutionType" AS ENUM ('CASH', 'POINTS', 'COUPON');

-- AlterTable
ALTER TABLE "Compensation" ADD COLUMN     "resolutionCouponId" TEXT,
ADD COLUMN     "resolutionType" "CompensationResolutionType",
ADD COLUMN     "resolutionValue" DECIMAL(12,2);

-- AddForeignKey
ALTER TABLE "Compensation" ADD CONSTRAINT "Compensation_resolutionCouponId_fkey" FOREIGN KEY ("resolutionCouponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

