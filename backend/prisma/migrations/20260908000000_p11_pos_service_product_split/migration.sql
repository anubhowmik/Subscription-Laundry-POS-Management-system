-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('PRODUCT', 'SERVICE', 'MIXED');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "saleType" "SaleType";

-- Backfill: derive saleType for every existing Sale from its current SaleItem composition.
-- MIXED if it has both a product line and a service line, else whichever one it has.
-- Left NULL only if a sale somehow has zero items (shouldn't occur given checkout's min-1-item rule).
UPDATE "Sale" s SET "saleType" =
  CASE
    WHEN EXISTS (SELECT 1 FROM "SaleItem" si WHERE si."saleId" = s.id AND si."productId" IS NOT NULL)
     AND EXISTS (SELECT 1 FROM "SaleItem" si WHERE si."saleId" = s.id AND si."serviceId" IS NOT NULL)
      THEN 'MIXED'::"SaleType"
    WHEN EXISTS (SELECT 1 FROM "SaleItem" si WHERE si."saleId" = s.id AND si."productId" IS NOT NULL)
      THEN 'PRODUCT'::"SaleType"
    WHEN EXISTS (SELECT 1 FROM "SaleItem" si WHERE si."saleId" = s.id AND si."serviceId" IS NOT NULL)
      THEN 'SERVICE'::"SaleType"
    ELSE NULL
  END;
