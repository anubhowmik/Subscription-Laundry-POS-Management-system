import { Prisma } from "@prisma/client";
import { claimBusinessLocationNumber } from "../../utils/documentNumbering";

/**
 * Called once for every newly-created Payment row (every checkout/pay-due/refund site), inside the
 * same DB transaction. Mirrors what the reference does when a transaction_payment is saved:
 * assigns its auto `payment_ref_no`, resolves its account from the branch's default payment
 * account for that method (BusinessLocation > Payment Options), and posts the matching
 * account_transaction - CREDIT for money received, DEBIT for a refund paid out
 * (AccountTransaction::getAccountTransactionType / the is_return branch).
 */
export async function finalizeNewPayments(tx: Prisma.TransactionClient, paymentIds: string[]) {
  for (const id of paymentIds) {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id } });
    const paymentRefNo = payment.paymentRefNo ?? (await claimBusinessLocationNumber(tx, payment.businessLocationId, "payment"));

    let paymentAccountId = payment.paymentAccountId;
    if (!paymentAccountId) {
      const mapping = await tx.businessLocationPaymentAccount.findUnique({
        where: { businessLocationId_paymentMethodId: { businessLocationId: payment.businessLocationId, paymentMethodId: payment.paymentMethodId } },
        include: { paymentAccount: { select: { isClosed: true } } },
      });
      if (mapping && !mapping.paymentAccount.isClosed) paymentAccountId = mapping.paymentAccountId;
    }

    await tx.payment.update({ where: { id }, data: { paymentRefNo, paymentAccountId } });
    if (paymentAccountId) await syncPaymentAccountTransaction(tx, id);
  }
}

/** Reference's AccountTransaction::updateAccountTransaction - keeps a payment's single account
 * movement in step with the payment's current account/amount (used on create and on Link Account). */
export async function syncPaymentAccountTransaction(tx: Prisma.TransactionClient, paymentId: string) {
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const existing = await tx.paymentAccountTransaction.findUnique({ where: { paymentId } });

  if (!payment.paymentAccountId) {
    if (existing) await tx.paymentAccountTransaction.delete({ where: { id: existing.id } });
    return;
  }

  if (existing) {
    await tx.paymentAccountTransaction.update({
      where: { id: existing.id },
      data: { paymentAccountId: payment.paymentAccountId, amount: payment.amount },
    });
    return;
  }

  await tx.paymentAccountTransaction.create({
    data: {
      paymentAccountId: payment.paymentAccountId,
      type: payment.type === "REFUND" ? "DEBIT" : "CREDIT",
      amount: payment.amount,
      operationDate: payment.paymentDate,
      createdBy: payment.createdBy,
      paymentId,
    },
  });
}

/** Expenses and purchases carry a single `paidAmount` (no Payment rows), so their account movement
 * is one DEBIT row kept equal to paidAmount - created, resized, re-pointed or removed to match. */
export async function syncDocumentAccountTransaction(
  tx: Prisma.TransactionClient,
  kind: "expense" | "purchase",
  doc: { id: string; paymentAccountId: string | null; paidAmount: Prisma.Decimal; date: Date; createdBy: string; active?: boolean },
) {
  const where = kind === "expense" ? { expenseId: doc.id } : { purchaseId: doc.id };
  const existing = await tx.paymentAccountTransaction.findUnique({ where: where as Prisma.PaymentAccountTransactionWhereUniqueInput });
  const shouldExist = Boolean(doc.paymentAccountId) && doc.paidAmount.gt(0) && doc.active !== false;

  if (!shouldExist) {
    if (existing) await tx.paymentAccountTransaction.delete({ where: { id: existing.id } });
    return;
  }

  if (existing) {
    await tx.paymentAccountTransaction.update({
      where: { id: existing.id },
      data: { paymentAccountId: doc.paymentAccountId!, amount: doc.paidAmount, operationDate: doc.date },
    });
    return;
  }

  await tx.paymentAccountTransaction.create({
    data: {
      paymentAccountId: doc.paymentAccountId!,
      type: "DEBIT",
      amount: doc.paidAmount,
      operationDate: doc.date,
      createdBy: doc.createdBy,
      ...where,
    },
  });
}
