-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "contactType" TEXT NOT NULL DEFAULT 'individual',
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "prefix" TEXT;
