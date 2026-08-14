import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { NotFoundError } from "../../utils/AppError";

const SORTABLE_FIELDS = ["nameEn", "percentage", "createdAt"];

export async function list(query: Record<string, unknown>, organizationId: string) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "nameEn");

  const where: Prisma.TaxWhereInput = {
    organizationId,
    ...(query.isActive !== undefined ? { isActive: query.isActive === "true" } : {}),
    ...(query.search ? { OR: [{ nameEn: { contains: String(query.search), mode: "insensitive" } }, { nameAr: { contains: String(query.search) } }] } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.tax.findMany({ where, orderBy, skip, take: limit }),
    prisma.tax.count({ where }),
  ]);
  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const tax = await prisma.tax.findFirst({ where: { id, organizationId } });
  if (!tax) throw new NotFoundError("Tax not found");
  return tax;
}

export async function create(input: Omit<Prisma.TaxUncheckedCreateInput, "organizationId">, organizationId: string) {
  return prisma.tax.create({ data: { ...input, organizationId } });
}

export async function update(id: string, input: Prisma.TaxUncheckedUpdateInput, organizationId: string) {
  await getById(id, organizationId);
  return prisma.tax.update({ where: { id }, data: input });
}

export async function deactivate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.tax.update({ where: { id }, data: { isActive: false } });
}
