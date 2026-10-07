import { Prisma } from "@prisma/client";

// Atomically claims the next document number for a business location - the UPDATE takes a row
// lock on the BusinessLocation row, so concurrent writers against the same branch serialize here
// instead of racing (same pattern as the ZATCA icv claim in pos.service.ts). Numbering is
// per-branch, not per-org (P7-5) - two different branches can legitimately produce the same
// number.
//
// All kinds (invoice/quote/draft/return/reissue/expense) share one yearly-reset event: when
// numberResetYearly is on, the first number claimed of ANY kind after the calendar year rolls
// over zeroes every sequence together and stamps lastNumberResetYear, rather than each sequence
// resetting independently the first time it happens to be used that year.
export type DocumentNumberKind = "invoice" | "quote" | "draft" | "return" | "reissue" | "expense" | "adjustment" | "payment";

export async function claimBusinessLocationNumber(
  tx: Prisma.TransactionClient,
  businessLocationId: string,
  kind: DocumentNumberKind,
): Promise<string> {
  const loc = await tx.businessLocation.findUniqueOrThrow({ where: { id: businessLocationId } });
  const currentYear = new Date().getFullYear();
  const needsReset = loc.numberResetYearly && loc.lastNumberResetYear !== currentYear;

  let updated;
  if (needsReset) {
    updated = await tx.businessLocation.update({
      where: { id: businessLocationId },
      data: {
        lastInvoiceSeq: kind === "invoice" ? 1 : 0,
        lastQuoteSeq: kind === "quote" ? 1 : 0,
        lastDraftSeq: kind === "draft" ? 1 : 0,
        lastReturnSeq: kind === "return" ? 1 : 0,
        lastReissueSeq: kind === "reissue" ? 1 : 0,
        lastExpenseSeq: kind === "expense" ? 1 : 0,
        lastAdjustmentSeq: kind === "adjustment" ? 1 : 0,
        lastPaymentSeq: kind === "payment" ? 1 : 0,
        lastNumberResetYear: currentYear,
      },
    });
  } else {
    switch (kind) {
      case "invoice":
        updated = await tx.businessLocation.update({ where: { id: businessLocationId }, data: { lastInvoiceSeq: { increment: 1 } } });
        break;
      case "quote":
        updated = await tx.businessLocation.update({ where: { id: businessLocationId }, data: { lastQuoteSeq: { increment: 1 } } });
        break;
      case "draft":
        updated = await tx.businessLocation.update({ where: { id: businessLocationId }, data: { lastDraftSeq: { increment: 1 } } });
        break;
      case "return":
        updated = await tx.businessLocation.update({ where: { id: businessLocationId }, data: { lastReturnSeq: { increment: 1 } } });
        break;
      case "reissue":
        updated = await tx.businessLocation.update({ where: { id: businessLocationId }, data: { lastReissueSeq: { increment: 1 } } });
        break;
      case "expense":
        updated = await tx.businessLocation.update({ where: { id: businessLocationId }, data: { lastExpenseSeq: { increment: 1 } } });
        break;
      case "adjustment":
        updated = await tx.businessLocation.update({ where: { id: businessLocationId }, data: { lastAdjustmentSeq: { increment: 1 } } });
        break;
      case "payment":
        updated = await tx.businessLocation.update({ where: { id: businessLocationId }, data: { lastPaymentSeq: { increment: 1 } } });
        break;
    }
  }

  switch (kind) {
    case "invoice":
      return `${updated.invoiceNumberPrefix}${String(updated.lastInvoiceSeq).padStart(6, "0")}`;
    case "quote":
      return `${updated.quoteNumberPrefix}${String(updated.lastQuoteSeq).padStart(6, "0")}`;
    case "draft":
      return `${updated.draftNumberPrefix}${String(updated.lastDraftSeq).padStart(6, "0")}`;
    case "return":
      return `${updated.returnNumberPrefix}${String(updated.lastReturnSeq).padStart(6, "0")}`;
    case "reissue":
      return `${updated.reissueNumberPrefix}${String(updated.lastReissueSeq).padStart(6, "0")}`;
    case "expense":
      return `${updated.expenseNumberPrefix}${String(updated.lastExpenseSeq).padStart(6, "0")}`;
    case "adjustment":
      return `${updated.adjustmentNumberPrefix}${String(updated.lastAdjustmentSeq).padStart(6, "0")}`;
    case "payment":
      return `${updated.paymentNumberPrefix}${String(updated.lastPaymentSeq).padStart(6, "0")}`;
  }
}
