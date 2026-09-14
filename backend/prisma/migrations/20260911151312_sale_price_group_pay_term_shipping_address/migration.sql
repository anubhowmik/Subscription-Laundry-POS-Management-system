-- CreateEnum
CREATE TYPE "PayTermType" AS ENUM ('DAYS', 'MONTHS');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "payTermType" "PayTermType",
ADD COLUMN     "shippingAddress" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "payTermNumber" INTEGER,
ADD COLUMN     "payTermType" "PayTermType",
ADD COLUMN     "priceListId" TEXT;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "payTermType" "PayTermType",
ADD COLUMN     "shippingAddress" TEXT;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
