-- CreateTable
CREATE TABLE "InvoiceLayoutSettings" (
    "id" TEXT NOT NULL,
    "businessLocationId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL DEFAULT 'standard',
    "logoUrl" TEXT,
    "accentColor" TEXT,
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "showBranchName" BOOLEAN NOT NULL DEFAULT true,
    "showCity" BOOLEAN NOT NULL DEFAULT true,
    "showQrCode" BOOLEAN NOT NULL DEFAULT true,
    "showVatNumber" BOOLEAN NOT NULL DEFAULT true,
    "showCrNumber" BOOLEAN NOT NULL DEFAULT true,
    "showInvoiceUuid" BOOLEAN NOT NULL DEFAULT true,
    "showIcv" BOOLEAN NOT NULL DEFAULT true,
    "showCustomerVat" BOOLEAN NOT NULL DEFAULT true,
    "showCustomerPhone" BOOLEAN NOT NULL DEFAULT true,
    "showItemSku" BOOLEAN NOT NULL DEFAULT true,
    "showDiscountLine" BOOLEAN NOT NULL DEFAULT true,
    "showPaidDue" BOOLEAN NOT NULL DEFAULT true,
    "showEstimatedReady" BOOLEAN NOT NULL DEFAULT true,
    "showRegisterSession" BOOLEAN NOT NULL DEFAULT true,
    "showDigitalSignatureNote" BOOLEAN NOT NULL DEFAULT true,
    "labelOverrides" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceLayoutSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLayoutSettings_businessLocationId_key" ON "InvoiceLayoutSettings"("businessLocationId");

-- AddForeignKey
ALTER TABLE "InvoiceLayoutSettings" ADD CONSTRAINT "InvoiceLayoutSettings_businessLocationId_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

