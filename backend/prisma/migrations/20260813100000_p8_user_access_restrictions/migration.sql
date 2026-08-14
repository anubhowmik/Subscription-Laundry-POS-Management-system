-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allowLogin" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxDiscountPercent" DECIMAL(5,2),
ALTER COLUMN "username" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "UserCustomer" (
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,

    CONSTRAINT "UserCustomer_pkey" PRIMARY KEY ("userId","customerId")
);

-- CreateTable
CREATE TABLE "UserCustomerGroup" (
    "userId" TEXT NOT NULL,
    "customerGroupId" TEXT NOT NULL,

    CONSTRAINT "UserCustomerGroup_pkey" PRIMARY KEY ("userId","customerGroupId")
);

-- CreateTable
CREATE TABLE "UserTransferFromLocation" (
    "userId" TEXT NOT NULL,
    "businessLocationId" TEXT NOT NULL,

    CONSTRAINT "UserTransferFromLocation_pkey" PRIMARY KEY ("userId","businessLocationId")
);

-- AddForeignKey
ALTER TABLE "UserCustomer" ADD CONSTRAINT "UserCustomer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCustomer" ADD CONSTRAINT "UserCustomer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCustomerGroup" ADD CONSTRAINT "UserCustomerGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCustomerGroup" ADD CONSTRAINT "UserCustomerGroup_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "CustomerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTransferFromLocation" ADD CONSTRAINT "UserTransferFromLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTransferFromLocation" ADD CONSTRAINT "UserTransferFromLocation_businessLocationId_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

