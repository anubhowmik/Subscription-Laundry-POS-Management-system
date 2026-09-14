-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "additionalNo" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "allowExpeditedDiscount" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "buildingNo" TEXT,
ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "contactType" TEXT NOT NULL DEFAULT 'individual',
ADD COLUMN     "country" TEXT,
ADD COLUMN     "customField1" TEXT,
ADD COLUMN     "customField10" TEXT,
ADD COLUMN     "customField2" TEXT,
ADD COLUMN     "customField3" TEXT,
ADD COLUMN     "customField4" TEXT,
ADD COLUMN     "customField5" TEXT,
ADD COLUMN     "customField6" TEXT,
ADD COLUMN     "customField7" TEXT,
ADD COLUMN     "customField8" TEXT,
ADD COLUMN     "customField9" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "globalCustomer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "idType" TEXT,
ADD COLUMN     "landline" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "mapLocation" TEXT,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "prefix" TEXT,
ADD COLUMN     "state" TEXT;

-- CreateTable
CREATE TABLE "CustomerContactPerson" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "prefix" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT,
    "mobile" TEXT,
    "altPhone" TEXT,
    "familyContactNumber" TEXT,
    "department" TEXT,
    "designation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerContactPerson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerContactPerson_customerId_idx" ON "CustomerContactPerson"("customerId");

-- AddForeignKey
ALTER TABLE "CustomerContactPerson" ADD CONSTRAINT "CustomerContactPerson_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
