-- CreateEnum
CREATE TYPE "CustomerApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "approvalStatus" "CustomerApprovalStatus" NOT NULL DEFAULT 'APPROVED';

-- AlterTable
ALTER TABLE "CustomerGroup" ADD COLUMN     "maxAmountPerMonth" DECIMAL(12,2),
ADD COLUMN     "maxInvoicesPerMonth" INTEGER,
ADD COLUMN     "maxQtyPerMonth" DECIMAL(12,3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "customerApprovalRequired" BOOLEAN NOT NULL DEFAULT false;

