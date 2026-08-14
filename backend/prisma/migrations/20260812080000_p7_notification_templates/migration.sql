-- CreateEnum
CREATE TYPE "NotificationTrigger" AS ENUM ('ORDER_READY', 'ORDER_DELIVERED', 'NEW_SALE', 'PAYMENT_RECEIVED', 'PAYMENT_REMINDER', 'COMPENSATION_RESOLVED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "paymentReminderAfterDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "paymentReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentReminderIntervalDays" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "lastReminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "trigger" "NotificationTrigger" NOT NULL,
    "messageEn" TEXT NOT NULL,
    "messageAr" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_organizationId_trigger_key" ON "NotificationTemplate"("organizationId", "trigger");

-- AddForeignKey
ALTER TABLE "NotificationTemplate" ADD CONSTRAINT "NotificationTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

