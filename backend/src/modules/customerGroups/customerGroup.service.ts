import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { NotFoundError, ValidationError } from "../../utils/AppError";
import { finalizeNewPayments } from "../paymentAccounts/paymentAccountLink";

const { Decimal } = Prisma;

const SORTABLE_FIELDS = ["nameEn", "createdAt"];

// Sales still owed by any customer in this group - oldest first, matching the reference's own
// "apply a lump-sum group payment FIFO against outstanding invoices" behavior.
function outstandingSalesWhere(groupId: string, organizationId: string): Prisma.SaleWhereInput {
  return { organizationId, status: "FINAL", paymentStatus: { in: ["DUE", "PARTIAL"] }, customer: { customerGroupId: groupId } };
}

const DEFAULT_ACCOUNT_INCLUDE = { defaultAccount: { select: { id: true, code: true, nameEn: true, nameAr: true } } } satisfies Prisma.CustomerGroupInclude;

export async function list(query: Record<string, unknown>, organizationId: string) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "nameEn");

  const where: Prisma.CustomerGroupWhereInput = {
    organizationId,
    ...(query.status ? { status: query.status as "ACTIVE" | "INACTIVE" } : {}),
    ...(query.isCorporate === "true" ? { isCorporate: true } : {}),
    ...(query.priceCalculationType ? { priceCalculationType: query.priceCalculationType as "PERCENTAGE" | "SELLING_PRICE_GROUP" } : {}),
    ...(query.invoiceType ? { invoiceType: query.invoiceType as "DELIVERY" | "FINAL" } : {}),
    ...(query.search ? { OR: [{ nameEn: { contains: String(query.search), mode: "insensitive" } }, { nameAr: { contains: String(query.search) } }] } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.customerGroup.findMany({ where, orderBy, skip, take: limit, include: DEFAULT_ACCOUNT_INCLUDE }),
    prisma.customerGroup.count({ where }),
  ]);
  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const group = await prisma.customerGroup.findFirst({ where: { id, organizationId }, include: DEFAULT_ACCOUNT_INCLUDE });
  if (!group) throw new NotFoundError("Customer group not found");
  return group;
}

export async function create(input: Omit<Prisma.CustomerGroupUncheckedCreateInput, "organizationId">, organizationId: string) {
  return prisma.customerGroup.create({ data: { ...input, organizationId }, include: DEFAULT_ACCOUNT_INCLUDE });
}

export async function update(id: string, input: Prisma.CustomerGroupUncheckedUpdateInput, organizationId: string) {
  await getById(id, organizationId);
  return prisma.customerGroup.update({ where: { id }, data: input, include: DEFAULT_ACCOUNT_INCLUDE });
}

export async function deactivate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.customerGroup.update({ where: { id }, data: { status: "INACTIVE" } });
}

export async function activate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.customerGroup.update({ where: { id }, data: { status: "ACTIVE" } });
}

// The group's aggregate sell due (EJADA reference's "Pay" row action - pay-customer-group-due,
// type=sell) - every customer in this group's own dues combined, since our schema has no
// supplier-side concept of a Customer Group (unlike the reference's shared Contact model, which
// also supports purchase/purchase_return there).
export async function getDue(id: string, organizationId: string) {
  await getById(id, organizationId);
  const sales = await prisma.sale.findMany({
    where: outstandingSalesWhere(id, organizationId),
    orderBy: { saleDate: "asc" },
    select: { id: true, invoiceNumber: true, saleDate: true, totalAmount: true, dueAmount: true, customer: { select: { id: true, nameEn: true } } },
  });
  const totalDue = sales.reduce((sum, s) => sum.add(s.dueAmount), new Decimal(0));
  return { totalDue, sales };
}

export interface PayGroupDueInput {
  businessLocationId: string;
  paymentMethodId: string;
  amount: number;
  referenceNumber?: string;
  notes?: string;
  paymentDate?: string;
}

export async function payDue(id: string, input: PayGroupDueInput, organizationId: string, userId: string) {
  await getById(id, organizationId);
  const amount = new Decimal(input.amount);

  return prisma.$transaction(async (tx) => {
    const sales = await tx.sale.findMany({ where: outstandingSalesWhere(id, organizationId), orderBy: { saleDate: "asc" } });
    const totalDue = sales.reduce((sum, s) => sum.add(s.dueAmount), new Decimal(0));
    if (amount.gt(totalDue)) {
      throw new ValidationError([{ field: "amount", message: `Amount cannot exceed the group's total due of ${totalDue.toFixed(2)}` }]);
    }

    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
    let remaining = amount;
    let invoicesAffected = 0;

    for (const sale of sales) {
      if (remaining.lte(0)) break;
      const applyAmount = Decimal.min(remaining, sale.dueAmount);
      if (applyAmount.lte(0)) continue;

      const groupPayment = await tx.payment.create({
        data: {
          saleId: sale.id,
          customerId: sale.customerId,
          businessLocationId: input.businessLocationId,
          amount: applyAmount,
          paymentMethodId: input.paymentMethodId,
          type: "SALE_PAYMENT",
          referenceNumber: input.referenceNumber,
          paymentDate,
          notes: input.notes,
          createdBy: userId,
        },
      });
      await finalizeNewPayments(tx, [groupPayment.id]);

      const newPaidAmount = sale.paidAmount.add(applyAmount);
      const newDueAmount = sale.totalAmount.sub(newPaidAmount);
      let paymentStatus: "PAID" | "PARTIAL" | "DUE" | "OVERPAID";
      if (newPaidAmount.eq(0)) paymentStatus = "DUE";
      else if (newPaidAmount.gt(sale.totalAmount)) paymentStatus = "OVERPAID";
      else if (newPaidAmount.eq(sale.totalAmount)) paymentStatus = "PAID";
      else paymentStatus = "PARTIAL";

      await tx.sale.update({ where: { id: sale.id }, data: { paidAmount: newPaidAmount, dueAmount: newDueAmount, paymentStatus } });

      remaining = remaining.sub(applyAmount);
      invoicesAffected += 1;
    }

    return { amountApplied: amount.sub(remaining).toFixed(2), invoicesAffected, remainingGroupDue: totalDue.sub(amount).toFixed(2) };
  });
}
