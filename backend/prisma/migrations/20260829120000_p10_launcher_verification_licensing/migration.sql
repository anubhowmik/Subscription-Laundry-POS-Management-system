-- CreateEnum
CREATE TYPE "BillingPaymentPurpose" AS ENUM ('SUBSCRIPTION', 'SEAT_LICENSE');

-- DropForeignKey
ALTER TABLE "BillingPayment" DROP CONSTRAINT "BillingPayment_planId_fkey";

-- AlterTable
ALTER TABLE "BillingPayment" ADD COLUMN     "purpose" "BillingPaymentPurpose" NOT NULL DEFAULT 'SUBSCRIPTION',
ADD COLUMN     "seatQuantity" INTEGER,
ALTER COLUMN "planId" DROP NOT NULL,
ALTER COLUMN "billingInterval" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "purchasedUserSeats" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appAccessPosLaundry" BOOLEAN,
ADD COLUMN     "appAccessUsersRules" BOOLEAN,
ADD COLUMN     "appAccessZatca" BOOLEAN,
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- Data backfill: every user that already existed before this migration predates the email
-- verification feature and already has a working account - only NEW users (created after this
-- migration, via application code that explicitly passes emailVerified: false) go through the
-- verification flow for real.
UPDATE "User" SET "emailVerified" = true;

-- CreateTable
CREATE TABLE "EmailVerificationCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailVerificationCode_userId_idx" ON "EmailVerificationCode"("userId");

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationCode" ADD CONSTRAINT "EmailVerificationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
