import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { AppError, ConflictError, NotFoundError } from "../../utils/AppError";

const { Decimal } = Prisma;

const SORTABLE_FIELDS = ["nameEn", "createdAt", "balance"];

/** null = unrestricted (isSystemAdmin, or the actor has zero restriction rows). */
interface CustomerAccessScope {
  allowedCustomerIds: string[] | null;
  allowedCustomerGroupIds: string[] | null;
}

function customerAccessWhere(scope: CustomerAccessScope): Prisma.CustomerWhereInput {
  const or: Prisma.CustomerWhereInput[] = [];
  if (scope.allowedCustomerIds) or.push({ id: { in: scope.allowedCustomerIds } });
  if (scope.allowedCustomerGroupIds) or.push({ customerGroupId: { in: scope.allowedCustomerGroupIds } });
  if (or.length === 0) return {};
  return { OR: or };
}

export async function list(query: Record<string, unknown>, organizationId: string, scope: CustomerAccessScope = { allowedCustomerIds: null, allowedCustomerGroupIds: null }) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "createdAt");

  const where: Prisma.CustomerWhereInput = {
    organizationId,
    deletedAt: null,
    ...customerAccessWhere(scope),
    ...(query.status ? { status: query.status as "ACTIVE" | "INACTIVE" } : {}),
    ...(query.customerGroupId ? { customerGroupId: String(query.customerGroupId) } : {}),
    ...(query.businessLocationId ? { businessLocationId: String(query.businessLocationId) } : {}),
    ...(query.search
      ? {
          OR: [
            { nameEn: { contains: String(query.search), mode: "insensitive" } },
            { nameAr: { contains: String(query.search) } },
            { phone: { contains: String(query.search) } },
            { code: { contains: String(query.search), mode: "insensitive" } },
            { email: { contains: String(query.search), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy, skip, take: limit, include: { customerGroup: true } }),
    prisma.customer.count({ where }),
  ]);
  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string, scope: CustomerAccessScope = { allowedCustomerIds: null, allowedCustomerGroupIds: null }) {
  const customer = await prisma.customer.findFirst({
    where: { id, organizationId, deletedAt: null, ...customerAccessWhere(scope) },
    include: { customerGroup: true, businessLocation: true },
  });
  if (!customer) throw new NotFoundError("Customer not found");
  return customer;
}

async function generateCustomerCode(organizationId: string): Promise<string> {
  const count = await prisma.customer.count({ where: { organizationId } });
  return `CUST-${String(count + 1).padStart(5, "0")}`;
}

export async function create(
  input: Omit<Prisma.CustomerUncheckedCreateInput, "code" | "organizationId" | "balance">,
  organizationId: string,
) {
  const existing = await prisma.customer.findFirst({ where: { organizationId, phone: input.phone as string, deletedAt: null } });
  if (existing) throw new ConflictError("A customer with this phone number already exists");

  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { customerApprovalRequired: true } });
  const approvalStatus = org?.customerApprovalRequired ? "PENDING" : "APPROVED";

  const openingBalance = input.openingBalance ?? 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await generateCustomerCode(organizationId);
    try {
      return await prisma.customer.create({
        data: { ...input, code, organizationId, openingBalance, balance: openingBalance, approvalStatus },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt < 4) {
        continue; // code collision under concurrent writes - retry with a fresh count
      }
      throw err;
    }
  }
  throw new Error("Failed to generate a unique customer code");
}

export async function update(id: string, input: Prisma.CustomerUncheckedUpdateInput, organizationId: string) {
  await getById(id, organizationId);
  return prisma.customer.update({ where: { id }, data: input });
}

export async function deactivate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.customer.update({ where: { id }, data: { status: "INACTIVE" } });
}

export async function setApprovalStatus(id: string, status: "APPROVED" | "REJECTED", organizationId: string) {
  await getById(id, organizationId);
  return prisma.customer.update({ where: { id }, data: { approvalStatus: status } });
}

/**
 * Reconciles a customer's already-existing aggregate store credit against one specific unpaid
 * invoice, purely for accurate per-invoice reporting. Does NOT touch customer.balance - the
 * balance already correctly reflects the customer's net position (it was set once, correctly,
 * when the contributing sale/return was originally created); this only reclassifies how a given
 * invoice's own dueAmount is displayed. Touching balance again here would double-count.
 */
export async function applyCreditToSale(customerId: string, saleId: string, amount: number, organizationId: string, userId: string) {
  const customer = await getById(customerId, organizationId);
  const sale = await prisma.sale.findFirst({ where: { id: saleId, customerId, organizationId, status: "FINAL" } });
  if (!sale) throw new NotFoundError("Sale not found");
  if (sale.dueAmount.lte(0)) throw new ConflictError("This invoice has no outstanding balance");

  const availableCredit = customer.balance.lt(0) ? customer.balance.neg() : new Decimal(0);
  const amountDecimal = new Decimal(amount);
  const maxApplicable = Decimal.min(sale.dueAmount, availableCredit);
  if (amountDecimal.lte(0) || amountDecimal.gt(maxApplicable)) {
    throw new ConflictError(`Amount must be greater than 0 and no more than ${maxApplicable.toFixed(2)}`);
  }

  const storeCreditMethod = await prisma.paymentMethod.findFirst({ where: { organizationId, code: "STORE_CREDIT" } });
  if (!storeCreditMethod) throw new AppError(500, "Store credit payment method is not configured for this organization");

  const newPaidAmount = sale.paidAmount.add(amountDecimal);
  const newDueAmount = sale.dueAmount.sub(amountDecimal);
  let paymentStatus: "PAID" | "PARTIAL" | "DUE" | "OVERPAID";
  if (newPaidAmount.eq(0)) paymentStatus = "DUE";
  else if (newPaidAmount.gt(sale.totalAmount)) paymentStatus = "OVERPAID";
  else if (newPaidAmount.eq(sale.totalAmount)) paymentStatus = "PAID";
  else paymentStatus = "PARTIAL";

  return prisma.$transaction(async (tx) => {
    await tx.sale.update({
      where: { id: sale.id },
      data: { paidAmount: newPaidAmount.toDecimalPlaces(2), dueAmount: newDueAmount.toDecimalPlaces(2), paymentStatus },
    });
    await tx.payment.create({
      data: {
        saleId: sale.id,
        customerId,
        businessLocationId: sale.businessLocationId,
        amount: amountDecimal.toDecimalPlaces(2),
        paymentMethodId: storeCreditMethod.id,
        type: "SALE_PAYMENT",
        createdBy: userId,
      },
    });
    return tx.sale.findUniqueOrThrow({ where: { id: sale.id } });
  });
}

export async function getProfile(id: string, organizationId: string) {
  const customer = await getById(id, organizationId);
  const [sales, payments] = await Promise.all([
    prisma.sale.findMany({ where: { customerId: id, organizationId, status: "FINAL" }, orderBy: { saleDate: "desc" }, take: 20 }),
    prisma.payment.findMany({ where: { customerId: id }, orderBy: { paymentDate: "desc" }, take: 20 }),
  ]);
  return { customer, sales, payments };
}
