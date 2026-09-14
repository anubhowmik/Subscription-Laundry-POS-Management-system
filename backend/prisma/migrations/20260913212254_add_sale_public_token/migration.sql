-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "publicToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Sale_publicToken_key" ON "Sale"("publicToken");
