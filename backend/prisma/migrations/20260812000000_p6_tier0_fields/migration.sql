-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "openingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "lastInvoiceSeq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "creditLimit" DECIMAL(12,2) NOT NULL DEFAULT 0;

