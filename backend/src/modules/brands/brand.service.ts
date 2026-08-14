import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { NotFoundError } from "../../utils/AppError";

const SORTABLE_FIELDS = ["nameEn", "createdAt", "updatedAt"];

export async function list(query: Record<string, unknown>, organizationId: string) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "nameEn");

  const where: Prisma.BrandWhereInput = {
    organizationId,
    ...(query.status ? { status: query.status as "ACTIVE" | "INACTIVE" } : {}),
    ...(query.search
      ? { OR: [{ nameEn: { contains: String(query.search), mode: "insensitive" } }, { nameAr: { contains: String(query.search) } }] }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.brand.findMany({ where, orderBy, skip, take: limit }),
    prisma.brand.count({ where }),
  ]);
  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const brand = await prisma.brand.findFirst({ where: { id, organizationId } });
  if (!brand) throw new NotFoundError("Brand not found");
  return brand;
}

export async function create(input: Omit<Prisma.BrandUncheckedCreateInput, "organizationId">, organizationId: string) {
  return prisma.brand.create({ data: { ...input, organizationId } });
}

export async function update(id: string, input: Prisma.BrandUncheckedUpdateInput, organizationId: string) {
  await getById(id, organizationId);
  return prisma.brand.update({ where: { id }, data: input });
}

export async function deactivate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.brand.update({ where: { id }, data: { status: "INACTIVE" } });
}
