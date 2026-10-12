-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('TRADITIONAL_DISCOUNT', 'QUANTITY_DISCOUNT', 'PRICE_DISCOUNT', 'PRODUCT_GIFTS', 'BOUNCE', 'MULTIPLE_DISCOUNT', 'CASH_BACK');

-- CreateEnum
CREATE TYPE "PromotionDiscountType" AS ENUM ('FIXED', 'PERCENTAGE');

-- AlterTable
ALTER TABLE "CashbackTransaction" ADD COLUMN     "promotionId" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "promotionId" TEXT;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "promotionId" TEXT;

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PromotionType" NOT NULL,
    "salesQuantity" INTEGER,
    "salesAmount" DECIMAL(14,2),
    "locationGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "businessLocationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeBusinessLocationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customerGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priceListIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeCustomerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categoryKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeCategoryKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "brandIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "itemKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeItemKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applyIfAllProductsExist" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" DATE,
    "endsAt" DATE,
    "days" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "periods" JSONB,
    "discountType" "PromotionDiscountType",
    "discountAmount" DECIMAL(14,4),
    "daQuantity" INTEGER,
    "bounceQuantity" INTEGER,
    "giftQuantity" INTEGER,
    "giftItemKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoApply" BOOLEAN NOT NULL DEFAULT true,
    "fullCash" BOOLEAN NOT NULL DEFAULT false,
    "expeditedDiscount" BOOLEAN NOT NULL DEFAULT true,
    "excludeCustomerGroup" BOOLEAN NOT NULL DEFAULT true,
    "cashBackValue" DECIMAL(10,2),
    "pointsForCashBack" DECIMAL(10,2),
    "cashBackExpirationDays" INTEGER,
    "redeemAfterEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionLine" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "giftItemKey" TEXT NOT NULL,
    "giftQuantity" DECIMAL(12,3) NOT NULL,
    "discountPercent" DECIMAL(7,4) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PromotionLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Promotion_organizationId_idx" ON "Promotion"("organizationId");

-- CreateIndex
CREATE INDEX "PromotionLine_promotionId_idx" ON "PromotionLine"("promotionId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashbackTransaction" ADD CONSTRAINT "CashbackTransaction_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionLine" ADD CONSTRAINT "PromotionLine_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

