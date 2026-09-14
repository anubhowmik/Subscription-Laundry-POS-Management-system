-- CreateEnum
CREATE TYPE "PriceCalculationType" AS ENUM ('PERCENTAGE', 'SELLING_PRICE_GROUP');

-- CreateEnum
CREATE TYPE "CustomerGroupCapScope" AS ENUM ('CUSTOMER', 'COMPANY');

-- CreateEnum
CREATE TYPE "CustomerGroupInvoiceType" AS ENUM ('DELIVERY', 'FINAL');

-- AlterTable
ALTER TABLE "CustomerGroup" ADD COLUMN     "defaultAccountId" TEXT,
ADD COLUMN     "invoiceType" "CustomerGroupInvoiceType" NOT NULL DEFAULT 'FINAL',
ADD COLUMN     "isCorporate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxFor" "CustomerGroupCapScope",
ADD COLUMN     "priceCalculationType" "PriceCalculationType" NOT NULL DEFAULT 'SELLING_PRICE_GROUP',
ADD COLUMN     "priceEditable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sendSms" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "taxNumber" TEXT;

-- AddForeignKey
ALTER TABLE "CustomerGroup" ADD CONSTRAINT "CustomerGroup_defaultAccountId_fkey" FOREIGN KEY ("defaultAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
