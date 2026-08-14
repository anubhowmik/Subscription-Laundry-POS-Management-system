-- DropForeignKey
ALTER TABLE "Announcement" DROP CONSTRAINT "Announcement_businessLocationId_fkey";

-- DropIndex
DROP INDEX "Announcement_businessLocationId_idx";

-- AlterTable
ALTER TABLE "Announcement" DROP COLUMN "businessLocationId";

-- AlterTable
ALTER TABLE "BusinessLocation" ADD COLUMN     "branchNameAr" TEXT,
ADD COLUMN     "buildingNo" TEXT,
ADD COLUMN     "defaultPriceListId" TEXT,
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "printReceiptOnInvoice" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "receiptPrinterType" TEXT NOT NULL DEFAULT 'browser';

-- CreateTable
CREATE TABLE "AnnouncementLocation" (
    "announcementId" TEXT NOT NULL,
    "businessLocationId" TEXT NOT NULL,

    CONSTRAINT "AnnouncementLocation_pkey" PRIMARY KEY ("announcementId","businessLocationId")
);

-- CreateTable
CREATE TABLE "BusinessLocationGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessLocationGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageRead" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageRead_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateIndex
CREATE INDEX "AnnouncementLocation_businessLocationId_idx" ON "AnnouncementLocation"("businessLocationId");

-- CreateIndex
CREATE INDEX "BusinessLocationGroup_organizationId_idx" ON "BusinessLocationGroup"("organizationId");

-- CreateIndex
CREATE INDEX "BusinessLocation_groupId_idx" ON "BusinessLocation"("groupId");

-- AddForeignKey
ALTER TABLE "AnnouncementLocation" ADD CONSTRAINT "AnnouncementLocation_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementLocation" ADD CONSTRAINT "AnnouncementLocation_businessLocationId_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessLocation" ADD CONSTRAINT "BusinessLocation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BusinessLocationGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessLocation" ADD CONSTRAINT "BusinessLocation_defaultPriceListId_fkey" FOREIGN KEY ("defaultPriceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessLocationGroup" ADD CONSTRAINT "BusinessLocationGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRead" ADD CONSTRAINT "MessageRead_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRead" ADD CONSTRAINT "MessageRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

