-- DropIndex
DROP INDEX "Sale_organizationId_invoiceNumber_key";

-- DropIndex
DROP INDEX "Sale_organizationId_quoteNumber_key";

-- AlterTable
ALTER TABLE "BusinessLocation" ADD COLUMN     "draftNumberPrefix" TEXT NOT NULL DEFAULT 'DFT-',
ADD COLUMN     "invoiceNumberPrefix" TEXT NOT NULL DEFAULT 'INV-',
ADD COLUMN     "lastDraftSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastInvoiceSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastNumberResetYear" INTEGER,
ADD COLUMN     "lastQuoteSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastReissueSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastReturnSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "numberResetYearly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paperWidthMm" INTEGER,
ADD COLUMN     "printerName" TEXT,
ADD COLUMN     "quoteNumberPrefix" TEXT NOT NULL DEFAULT 'QT-',
ADD COLUMN     "reissueNumberPrefix" TEXT NOT NULL DEFAULT 'RE-',
ADD COLUMN     "returnNumberPrefix" TEXT NOT NULL DEFAULT 'CN-';

-- AlterTable
ALTER TABLE "SellReturn" ADD COLUMN     "creditNoteNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Sale_businessLocationId_invoiceNumber_key" ON "Sale"("businessLocationId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_businessLocationId_quoteNumber_key" ON "Sale"("businessLocationId", "quoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SellReturn_businessLocationId_creditNoteNumber_key" ON "SellReturn"("businessLocationId", "creditNoteNumber");

