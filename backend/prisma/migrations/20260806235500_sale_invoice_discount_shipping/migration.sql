-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "invoiceDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "shippingAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

