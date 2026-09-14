-- AlterTable
ALTER TABLE "SellReturn" ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'DUE';

-- Backfill existing rows from their already-recorded refundedAmount/totalAmount, matching the
-- exact same logic sellReturn.service.ts's create() now uses for new rows.
UPDATE "SellReturn"
SET "paymentStatus" = CASE
  WHEN "refundedAmount" <= 0 THEN 'DUE'
  WHEN "refundedAmount" >= "totalAmount" THEN 'PAID'
  ELSE 'PARTIAL'
END::"PaymentStatus";
