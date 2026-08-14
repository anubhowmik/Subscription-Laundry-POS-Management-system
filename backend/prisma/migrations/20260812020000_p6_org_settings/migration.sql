-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
ADD COLUMN     "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "invoiceNumberPrefix" TEXT NOT NULL DEFAULT 'INV-',
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "maxPointsPerOrder" INTEGER,
ADD COLUMN     "maxRedeemPoints" INTEGER,
ADD COLUMN     "minOrderForPoints" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "minRedeemPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pointValueSar" DECIMAL(6,3) NOT NULL DEFAULT 0.1,
ADD COLUMN     "pointsEarnDivisor" DECIMAL(6,2) NOT NULL DEFAULT 10,
ADD COLUMN     "pointsExpiryDays" INTEGER,
ADD COLUMN     "reportFooterText" TEXT,
ADD COLUMN     "reportHeaderText" TEXT,
ADD COLUMN     "rewardPointsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rewardPointsName" TEXT NOT NULL DEFAULT 'Points',
ADD COLUMN     "themeColor" TEXT,
ADD COLUMN     "timeFormat24h" BOOLEAN NOT NULL DEFAULT false;

