-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "sellCustomField1Label" TEXT,
ADD COLUMN     "sellCustomField2Label" TEXT,
ADD COLUMN     "sellCustomField3Label" TEXT,
ADD COLUMN     "sellCustomField4Label" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "additionalExpense1Key" TEXT,
ADD COLUMN     "additionalExpense1Value" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "additionalExpense2Key" TEXT,
ADD COLUMN     "additionalExpense2Value" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "additionalExpense3Key" TEXT,
ADD COLUMN     "additionalExpense3Value" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "additionalExpense4Key" TEXT,
ADD COLUMN     "additionalExpense4Value" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "customField1" TEXT,
ADD COLUMN     "customField2" TEXT,
ADD COLUMN     "customField3" TEXT,
ADD COLUMN     "customField4" TEXT,
ADD COLUMN     "taxExemptionReasonCode" TEXT;
