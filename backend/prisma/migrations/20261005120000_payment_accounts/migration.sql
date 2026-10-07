-- CreateEnum
CREATE TYPE "PaymentAccountKind" AS ENUM ('BANK', 'CASH', 'CHEQUE');

-- CreateEnum
CREATE TYPE "PaymentAccountTxnType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "PaymentAccountTxnSubType" AS ENUM ('OPENING_BALANCE', 'DEPOSIT', 'FUND_TRANSFER');

-- AlterTable
ALTER TABLE "BusinessLocation" ADD COLUMN     "lastPaymentSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentNumberPrefix" TEXT NOT NULL DEFAULT 'SP-';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "paymentAccountId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "paymentAccountId" TEXT,
ADD COLUMN     "paymentRefNo" TEXT;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "paymentAccountId" TEXT;

-- CreateTable
CREATE TABLE "PaymentAccountType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentAccountTypeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAccountType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "kind" "PaymentAccountKind" NOT NULL DEFAULT 'BANK',
    "accountTypeId" TEXT,
    "accountDetails" JSONB,
    "note" TEXT,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "isMajor" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAccountTransaction" (
    "id" TEXT NOT NULL,
    "paymentAccountId" TEXT NOT NULL,
    "type" "PaymentAccountTxnType" NOT NULL,
    "subType" "PaymentAccountTxnSubType",
    "amount" DECIMAL(14,2) NOT NULL,
    "operationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "referenceNo" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paymentId" TEXT,
    "expenseId" TEXT,
    "purchaseId" TEXT,
    "transferTransactionId" TEXT,

    CONSTRAINT "PaymentAccountTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessLocationPaymentAccount" (
    "id" TEXT NOT NULL,
    "businessLocationId" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "paymentAccountId" TEXT NOT NULL,

    CONSTRAINT "BusinessLocationPaymentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentAccountType_organizationId_idx" ON "PaymentAccountType"("organizationId");

-- CreateIndex
CREATE INDEX "PaymentAccount_organizationId_idx" ON "PaymentAccount"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAccountTransaction_paymentId_key" ON "PaymentAccountTransaction"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAccountTransaction_expenseId_key" ON "PaymentAccountTransaction"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAccountTransaction_purchaseId_key" ON "PaymentAccountTransaction"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAccountTransaction_transferTransactionId_key" ON "PaymentAccountTransaction"("transferTransactionId");

-- CreateIndex
CREATE INDEX "PaymentAccountTransaction_paymentAccountId_operationDate_idx" ON "PaymentAccountTransaction"("paymentAccountId", "operationDate");

-- CreateIndex
CREATE INDEX "BusinessLocationPaymentAccount_paymentAccountId_idx" ON "BusinessLocationPaymentAccount"("paymentAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessLocationPaymentAccount_businessLocationId_paymentMe_key" ON "BusinessLocationPaymentAccount"("businessLocationId", "paymentMethodId");

-- AddForeignKey
ALTER TABLE "PaymentAccountType" ADD CONSTRAINT "PaymentAccountType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccountType" ADD CONSTRAINT "PaymentAccountType_parentAccountTypeId_fkey" FOREIGN KEY ("parentAccountTypeId") REFERENCES "PaymentAccountType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_accountTypeId_fkey" FOREIGN KEY ("accountTypeId") REFERENCES "PaymentAccountType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccountTransaction" ADD CONSTRAINT "PaymentAccountTransaction_transferTransactionId_fkey" FOREIGN KEY ("transferTransactionId") REFERENCES "PaymentAccountTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccountTransaction" ADD CONSTRAINT "PaymentAccountTransaction_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccountTransaction" ADD CONSTRAINT "PaymentAccountTransaction_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccountTransaction" ADD CONSTRAINT "PaymentAccountTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccountTransaction" ADD CONSTRAINT "PaymentAccountTransaction_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccountTransaction" ADD CONSTRAINT "PaymentAccountTransaction_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessLocationPaymentAccount" ADD CONSTRAINT "BusinessLocationPaymentAccount_businessLocationId_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessLocationPaymentAccount" ADD CONSTRAINT "BusinessLocationPaymentAccount_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessLocationPaymentAccount" ADD CONSTRAINT "BusinessLocationPaymentAccount_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

