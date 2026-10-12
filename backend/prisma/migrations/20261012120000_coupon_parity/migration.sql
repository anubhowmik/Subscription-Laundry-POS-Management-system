-- Coupons rebuilt to the EJADA reference (CouponController / coupons table): name, multi-value
-- conditions, days / periods, added discount, OTP flag, source, soft delete, and the line-level
-- coupon on SaleItem.

-- CreateEnum
CREATE TYPE "CouponSource" AS ENUM ('SINGLE', 'BULK', 'EXCEL');

-- New columns first, so the old single-value targeting can be carried over before it is dropped.
ALTER TABLE "Coupon"
ADD COLUMN     "addedBy" "CouponSource" NOT NULL DEFAULT 'SINGLE',
ADD COLUMN     "addedDiscount" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "brandIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "businessLocationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "categoryKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "customerGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "customerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "days" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "excludeCustomerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "itemKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "locationGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "otp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "periods" JSONB;

-- Carry the old single branch / customer / customer group targeting into the new lists, and give
-- existing coupons their code as a name. Coupons minted by Compensations also stay single-customer.
UPDATE "Coupon" SET "businessLocationIds" = ARRAY["businessLocationId"] WHERE "businessLocationId" IS NOT NULL;
UPDATE "Coupon" SET "customerIds" = ARRAY["customerId"] WHERE "customerId" IS NOT NULL;
UPDATE "Coupon" SET "customerGroupIds" = ARRAY["customerGroupId"] WHERE "customerGroupId" IS NOT NULL;
UPDATE "Coupon" SET "name" = "code" WHERE "name" = '';

-- DropForeignKey
ALTER TABLE "Coupon" DROP CONSTRAINT "Coupon_businessLocationId_fkey";
ALTER TABLE "Coupon" DROP CONSTRAINT "Coupon_customerGroupId_fkey";
ALTER TABLE "Coupon" DROP CONSTRAINT "Coupon_customerId_fkey";

-- DropIndex
DROP INDEX "Coupon_businessLocationId_idx";
DROP INDEX "Coupon_customerId_idx";

-- Old single-value columns, and the validity window becomes whole days (the shop's Riyadh calendar
-- day of the old timestamp, not its UTC date).
ALTER TABLE "Coupon" DROP COLUMN "businessLocationId",
DROP COLUMN "customerGroupId",
DROP COLUMN "customerId",
ALTER COLUMN "validFrom" SET DATA TYPE DATE USING (("validFrom" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Riyadh')::date,
ALTER COLUMN "validUntil" SET DATA TYPE DATE USING (("validUntil" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Riyadh')::date;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "couponId" TEXT;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
