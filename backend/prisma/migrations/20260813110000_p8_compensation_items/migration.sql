-- CreateTable
CREATE TABLE "CompensationItem" (
    "id" TEXT NOT NULL,
    "compensationId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "reason" "CompensationReason" NOT NULL,
    "claimedAmount" DECIMAL(12,2) NOT NULL,
    "approvedAmount" DECIMAL(12,2),

    CONSTRAINT "CompensationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompensationItem_compensationId_idx" ON "CompensationItem"("compensationId");

-- CreateIndex
CREATE INDEX "CompensationItem_saleItemId_idx" ON "CompensationItem"("saleItemId");

-- AddForeignKey
ALTER TABLE "CompensationItem" ADD CONSTRAINT "CompensationItem_compensationId_fkey" FOREIGN KEY ("compensationId") REFERENCES "Compensation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationItem" ADD CONSTRAINT "CompensationItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every existing Compensation becomes exactly one CompensationItem (the old model had
-- no quantity or multi-item support, so this is a best-effort 1:1 mapping). A "whole invoice"
-- claim (saleItemId was null) falls back to that sale's first line item so the NOT NULL
-- constraint above can be satisfied; a claim whose sale somehow has zero items is left with no
-- item row (shouldn't occur outside of malformed dev data).
INSERT INTO "CompensationItem" ("id", "compensationId", "saleItemId", "quantity", "reason", "claimedAmount", "approvedAmount")
SELECT
  gen_random_uuid(),
  c."id",
  COALESCE(c."saleItemId", (SELECT si."id" FROM "SaleItem" si WHERE si."saleId" = c."saleId" ORDER BY si."id" LIMIT 1)),
  1,
  c."reason",
  c."claimedAmount",
  c."approvedAmount"
FROM "Compensation" c
WHERE COALESCE(c."saleItemId", (SELECT si."id" FROM "SaleItem" si WHERE si."saleId" = c."saleId" ORDER BY si."id" LIMIT 1)) IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Compensation" DROP CONSTRAINT "Compensation_saleItemId_fkey";

-- AlterTable
ALTER TABLE "Compensation" DROP COLUMN "reason",
DROP COLUMN "saleItemId";
