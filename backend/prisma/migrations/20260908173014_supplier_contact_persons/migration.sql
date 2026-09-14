-- CreateTable
CREATE TABLE "SupplierContactPerson" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
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

    CONSTRAINT "SupplierContactPerson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierContactPerson_supplierId_idx" ON "SupplierContactPerson"("supplierId");

-- AddForeignKey
ALTER TABLE "SupplierContactPerson" ADD CONSTRAINT "SupplierContactPerson_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
