-- CreateEnum
CREATE TYPE "BnplProvider" AS ENUM ('TAMARA', 'TABBY', 'MISPAY');

-- CreateEnum
CREATE TYPE "BnplSessionStatus" AS ENUM ('CREATED', 'APPROVED', 'CAPTURED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "BnplProviderSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "BnplProvider" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "merchantTokenEncrypted" TEXT,
    "apiBaseUrlOverride" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BnplProviderSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BnplSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessLocationId" TEXT NOT NULL,
    "provider" "BnplProvider" NOT NULL,
    "providerSessionId" TEXT NOT NULL,
    "status" "BnplSessionStatus" NOT NULL DEFAULT 'CREATED',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "customerId" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "checkoutUrl" TEXT,
    "saleId" TEXT,
    "rawLastResponse" JSONB,
    "failureReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BnplSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BnplProviderSettings_organizationId_idx" ON "BnplProviderSettings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BnplProviderSettings_organizationId_provider_key" ON "BnplProviderSettings"("organizationId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "BnplSession_saleId_key" ON "BnplSession"("saleId");

-- CreateIndex
CREATE INDEX "BnplSession_organizationId_status_idx" ON "BnplSession"("organizationId", "status");

-- CreateIndex
CREATE INDEX "BnplSession_businessLocationId_idx" ON "BnplSession"("businessLocationId");

-- AddForeignKey
ALTER TABLE "BnplProviderSettings" ADD CONSTRAINT "BnplProviderSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BnplSession" ADD CONSTRAINT "BnplSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BnplSession" ADD CONSTRAINT "BnplSession_businessLocationId_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BnplSession" ADD CONSTRAINT "BnplSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BnplSession" ADD CONSTRAINT "BnplSession_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BnplSession" ADD CONSTRAINT "BnplSession_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

