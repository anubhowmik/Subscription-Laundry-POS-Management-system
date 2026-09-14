-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('POS', 'ADD_SALE');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "channel" "SaleChannel" NOT NULL DEFAULT 'POS';
