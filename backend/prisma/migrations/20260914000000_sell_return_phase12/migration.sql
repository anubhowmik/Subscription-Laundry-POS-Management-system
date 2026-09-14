-- Reassign any rows using the reason value we're removing before recreating the enum without it.
UPDATE "SellReturnItem" SET "reason" = 'NOT_FOUND' WHERE "reason" = 'OTHER';

-- AlterEnum: SellReturnReason drops OTHER (not part of the reference's own reason list)
ALTER TYPE "SellReturnReason" RENAME TO "SellReturnReason_old";
CREATE TYPE "SellReturnReason" AS ENUM ('NOT_WASHABLE', 'DAMAGED', 'NOT_FOUND');
ALTER TABLE "SellReturnItem" ALTER COLUMN "reason" TYPE "SellReturnReason" USING ("reason"::text::"SellReturnReason");
DROP TYPE "SellReturnReason_old";

-- AlterTable: return-level discount, mirroring Sale.invoiceDiscountAmount's convention
ALTER TABLE "SellReturn" ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
