-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "target" DECIMAL(14,2),
ADD COLUMN     "targetMtd" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "ServiceCategory" ADD COLUMN     "target" DECIMAL(14,2),
ADD COLUMN     "targetMtd" DECIMAL(14,2);

