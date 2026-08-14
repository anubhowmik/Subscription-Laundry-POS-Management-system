-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "lastQuoteSeq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "quoteNumber" TEXT,
ALTER COLUMN "invoiceNumber" DROP NOT NULL,
ALTER COLUMN "icv" DROP NOT NULL,
ALTER COLUMN "previousInvoiceHash" DROP NOT NULL,
ALTER COLUMN "invoiceHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Sale_organizationId_quoteNumber_key" ON "Sale"("organizationId", "quoteNumber");

