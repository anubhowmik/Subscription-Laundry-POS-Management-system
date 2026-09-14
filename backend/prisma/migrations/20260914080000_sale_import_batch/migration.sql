-- AlterTable: bulk "Import Sales" batch tracking (reference's own import_batch/import_time)
ALTER TABLE "Sale" ADD COLUMN     "importBatch" INTEGER,
ADD COLUMN     "importedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Sale_organizationId_importBatch_idx" ON "Sale"("organizationId", "importBatch");
