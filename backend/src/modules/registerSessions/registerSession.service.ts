import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ConflictError, NotFoundError } from "../../utils/AppError";
import { assertLocationAllowed } from "../../utils/locationScope";

const { Decimal } = Prisma;

export const REGISTER_SESSION_SORTABLE_FIELDS = ["openedAt", "closedAt", "cashDifference"];

export async function openSession(
  businessLocationId: string,
  openingCashAmount: number,
  organizationId: string,
  openedBy: string,
  allowedLocationIds: string[] | null,
) {
  assertLocationAllowed(businessLocationId, allowedLocationIds);
  const existing = await prisma.registerSession.findFirst({
    where: { businessLocationId, organizationId, status: "OPEN" },
  });
  if (existing) throw new ConflictError("A register is already open for this location");

  return prisma.$transaction(async (tx) => {
    const session = await tx.registerSession.create({
      data: { organizationId, businessLocationId, openedBy, openingCashAmount },
    });
    if (openingCashAmount > 0) {
      await tx.registerTransaction.create({
        data: {
          registerSessionId: session.id,
          type: "CREDIT",
          amount: openingCashAmount,
          paymentMethod: "CASH",
          referenceType: "INITIAL_FLOAT",
          note: "Opening float",
        },
      });
    }
    return session;
  });
}

export async function getCurrentSession(businessLocationId: string, organizationId: string, allowedLocationIds: string[] | null) {
  assertLocationAllowed(businessLocationId, allowedLocationIds);
  return prisma.registerSession.findFirst({
    where: { businessLocationId, organizationId, status: "OPEN" },
    include: { openedByUser: { select: { fullNameEn: true } } },
  });
}

/**
 * Closes a session: sums the RegisterTransaction ledger (CREDIT - DEBIT) to compute the expected
 * drawer amount, then compares against what the cashier actually counted. Deriving from the
 * ledger - rather than re-aggregating Payment rows - means cash refunds (DEBIT) are correctly
 * netted out instead of silently overstating the expected amount.
 */
export async function closeSession(
  id: string,
  countedCashAmount: number,
  notes: string | undefined,
  organizationId: string,
  closedBy: string,
  allowedLocationIds: string[] | null,
  denominations?: Record<string, number>,
) {
  const session = await prisma.registerSession.findFirst({ where: { id, organizationId, status: "OPEN" } });
  if (!session) throw new NotFoundError("Open register session not found");
  assertLocationAllowed(session.businessLocationId, allowedLocationIds);

  const [credits, debits] = await Promise.all([
    prisma.registerTransaction.aggregate({
      where: { registerSessionId: id, type: "CREDIT", paymentMethod: "CASH" },
      _sum: { amount: true },
    }),
    prisma.registerTransaction.aggregate({
      where: { registerSessionId: id, type: "DEBIT", paymentMethod: "CASH" },
      _sum: { amount: true },
    }),
  ]);

  const expectedCashAmount = (credits._sum.amount ?? new Decimal(0)).sub(debits._sum.amount ?? new Decimal(0));
  const counted = new Decimal(countedCashAmount);

  return prisma.registerSession.update({
    where: { id },
    data: {
      closedBy,
      closedAt: new Date(),
      expectedCashAmount,
      countedCashAmount: counted,
      cashDifference: counted.sub(expectedCashAmount),
      denominations,
      notes,
      status: "CLOSED",
    },
  });
}

export async function getLedger(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  const session = await prisma.registerSession.findFirst({ where: { id, organizationId } });
  if (!session) throw new NotFoundError("Register session not found");
  assertLocationAllowed(session.businessLocationId, allowedLocationIds);

  return prisma.registerTransaction.findMany({
    where: { registerSessionId: id },
    orderBy: { createdAt: "asc" },
  });
}

export async function listSessions(
  businessLocationId: string,
  organizationId: string,
  page: number,
  limit: number,
  allowedLocationIds: string[] | null,
  orderBy: Record<string, "asc" | "desc"> = { openedAt: "desc" },
) {
  assertLocationAllowed(businessLocationId, allowedLocationIds);
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    prisma.registerSession.findMany({
      where: { businessLocationId, organizationId },
      orderBy,
      skip,
      take: limit,
      include: {
        openedByUser: { select: { fullNameEn: true } },
        closedByUser: { select: { fullNameEn: true } },
      },
    }),
    prisma.registerSession.count({ where: { businessLocationId, organizationId } }),
  ]);
  return { data, meta: { page, limit, total } };
}
