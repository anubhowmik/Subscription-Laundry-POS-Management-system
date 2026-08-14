import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError, NotFoundError } from "../../utils/AppError";

const { Decimal } = Prisma;

export async function getLedger(customerId: string, organizationId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true, nameEn: true, nameAr: true, cashBack: true },
  });
  if (!customer) throw new NotFoundError("Customer not found");

  const transactions = await prisma.cashbackTransaction.findMany({
    where: { customerId, organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { sale: { select: { invoiceNumber: true } }, createdByUser: { select: { fullNameEn: true } } },
  });

  return { customer, transactions };
}

interface AdjustCashbackOptions {
  saleId?: string;
  compensationId?: string;
  expiresAt?: Date;
}

// Runs inside an already-open transaction - the only caller that needs this is pos.service.ts's
// checkout()/confirmQuote(), which must deduct cashback atomically alongside the rest of the sale
// (stock, payments, customer balance) rather than as a separate commit.
export async function adjustCashbackTx(
  tx: Prisma.TransactionClient,
  customerId: string,
  amount: Prisma.Decimal.Value,
  type: "GRANT" | "REDEEM" | "ADJUSTMENT",
  note: string,
  organizationId: string,
  createdBy: string | undefined,
  opts?: AdjustCashbackOptions,
) {
  const customer = await tx.customer.findFirst({ where: { id: customerId, organizationId } });
  if (!customer) throw new NotFoundError("Customer not found");

  const delta = new Decimal(amount);
  const newBalance = customer.cashBack.add(delta);
  if (newBalance.lt(0)) {
    throw new AppError(400, `Adjustment would make cashback negative (current: ${customer.cashBack.toFixed(2)}, change: ${delta.toFixed(2)})`);
  }

  await tx.customer.update({ where: { id: customerId }, data: { cashBack: newBalance } });
  return tx.cashbackTransaction.create({
    data: {
      organizationId,
      customerId,
      type,
      amount: delta,
      balanceAfter: newBalance,
      note,
      createdBy,
      saleId: opts?.saleId,
      compensationId: opts?.compensationId,
      expiresAt: opts?.expiresAt,
    },
  });
}

// Standalone entry point (its own transaction) for callers outside an existing one - the manual
// grant/adjust endpoint and compensation.service.ts's resolve() (which already applies its
// POINTS/COUPON side effects the same non-atomic way, so CASHBACK matches that existing pattern).
export async function adjustCashback(
  customerId: string,
  amount: Prisma.Decimal.Value,
  type: "GRANT" | "REDEEM" | "ADJUSTMENT",
  note: string,
  organizationId: string,
  createdBy: string | undefined,
  opts?: AdjustCashbackOptions,
) {
  return prisma.$transaction((tx) => adjustCashbackTx(tx, customerId, amount, type, note, organizationId, createdBy, opts));
}
