-- CreateEnum
CREATE TYPE "RegisterTransactionType" AS ENUM ('CREDIT', 'DEBIT');

-- AlterTable
ALTER TABLE "RegisterSession" ADD COLUMN     "denominations" JSONB;

-- CreateTable
CREATE TABLE "RegisterTransaction" (
    "id" TEXT NOT NULL,
    "registerSessionId" TEXT NOT NULL,
    "type" "RegisterTransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegisterTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegisterTransaction_registerSessionId_idx" ON "RegisterTransaction"("registerSessionId");

-- AddForeignKey
ALTER TABLE "RegisterTransaction" ADD CONSTRAINT "RegisterTransaction_registerSessionId_fkey" FOREIGN KEY ("registerSessionId") REFERENCES "RegisterSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

