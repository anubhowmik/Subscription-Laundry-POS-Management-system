import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { ConflictError, NotFoundError } from "../../utils/AppError";

const SORTABLE_FIELDS = ["nameEn", "createdAt", "balance"];

export async function list(query: Record<string, unknown>, organizationId: string) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "createdAt");

  const where: Prisma.SupplierWhereInput = {
    organizationId,
    deletedAt: null,
    ...(query.status ? { status: query.status as "ACTIVE" | "INACTIVE" } : {}),
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
    prisma.supplier.findMany({ where, orderBy, skip, take: limit }),
    prisma.supplier.count({ where }),
  ]);
  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const supplier = await prisma.supplier.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (!supplier) throw new NotFoundError("Supplier not found");
  return supplier;
}

async function generateSupplierCode(organizationId: string): Promise<string> {
  const count = await prisma.supplier.count({ where: { organizationId } });
  return `SUP-${String(count + 1).padStart(5, "0")}`;
}

export async function create(
  input: Omit<Prisma.SupplierUncheckedCreateInput, "code" | "organizationId" | "balance">,
  organizationId: string,
) {
  const existing = await prisma.supplier.findFirst({ where: { organizationId, phone: input.phone as string, deletedAt: null } });
  if (existing) throw new ConflictError("A supplier with this phone number already exists");

  const openingBalance = input.openingBalance ?? 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await generateSupplierCode(organizationId);
    try {
      return await prisma.supplier.create({
        data: { ...input, code, organizationId, openingBalance, balance: openingBalance },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt < 4) {
        continue; // code collision under concurrent writes - retry with a fresh count
      }
      throw err;
    }
  }
  throw new Error("Failed to generate a unique supplier code");
}

export async function update(id: string, input: Prisma.SupplierUncheckedUpdateInput, organizationId: string) {
  await getById(id, organizationId);
  return prisma.supplier.update({ where: { id }, data: input });
}

export async function deactivate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.supplier.update({ where: { id }, data: { status: "INACTIVE" } });
}

export async function getProfile(id: string, organizationId: string) {
  const supplier = await getById(id, organizationId);
  const [purchases, purchaseReturns] = await Promise.all([
    prisma.purchase.findMany({ where: { supplierId: id, organizationId }, orderBy: { purchaseDate: "desc" }, take: 20 }),
    prisma.purchaseReturn.findMany({ where: { supplierId: id, organizationId }, orderBy: { returnDate: "desc" }, take: 20 }),
  ]);
  return { supplier, purchases, purchaseReturns };
}
