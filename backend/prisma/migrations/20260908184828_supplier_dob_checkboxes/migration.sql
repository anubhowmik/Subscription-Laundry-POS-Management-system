-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "allowExpeditedDiscount" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "globalCustomer" BOOLEAN NOT NULL DEFAULT false;
