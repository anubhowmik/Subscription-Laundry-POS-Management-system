import { prisma } from "../../config/prisma";
import { AppError, NotFoundError } from "../../utils/AppError";

export async function getLedger(customerId: string, organizationId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true, nameEn: true, nameAr: true, rewardPoints: true },
  });
  if (!customer) throw new NotFoundError("Customer not found");

  const transactions = await prisma.loyaltyTransaction.findMany({
    where: { customerId, organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { sale: { select: { invoiceNumber: true } }, createdByUser: { select: { fullNameEn: true } } },
  });

  return { customer, transactions };
}

export async function adjustPoints(customerId: string, points: number, note: string, organizationId: string, createdBy: string) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, organizationId } });
  if (!customer) throw new NotFoundError("Customer not found");

  const newBalance = customer.rewardPoints + points;
  if (newBalance < 0) throw new AppError(400, `Adjustment would make points negative (current: ${customer.rewardPoints}, change: ${points})`);

  return prisma.$transaction(async (tx) => {
    await tx.customer.update({ where: { id: customerId }, data: { rewardPoints: newBalance } });
    return tx.loyaltyTransaction.create({
      data: { organizationId, customerId, type: "ADJUSTMENT", points, balanceAfter: newBalance, note, createdBy },
    });
  });
}
