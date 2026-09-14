-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "deliveryNumber" TEXT,
ADD COLUMN     "isQuotation" BOOLEAN NOT NULL DEFAULT true;
