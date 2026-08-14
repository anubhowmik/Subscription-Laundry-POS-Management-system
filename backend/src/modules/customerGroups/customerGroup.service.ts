import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { NotFoundError } from "../../utils/AppError";

const SORTABLE_FIELDS = ["nameEn", "createdAt"];

export async function list(query: Record<string, unknown>, organizationId: string) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "nameEn");

  const where: Prisma.CustomerGroupWhereInput = {
    organizationId,
    ...(query.status ? { status: query.status as "ACTIVE" | "INACTIVE" } : {}),
    ...(query.search ? { OR: [{ nameEn: { contains: String(query.search), mode: "insensitive" } }, { nameAr: { contains: String(query.search) } }] } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.customerGroup.findMany({ where, orderBy, skip, take: limit }),
    prisma.customerGroup.count({ where }),
  ]);
  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const group = await prisma.customerGroup.findFirst({ where: { id, organizationId } });
  if (!group) throw new NotFoundError("Customer group not found");
  return group;
}

export async function create(input: Omit<Prisma.CustomerGroupUncheckedCreateInput, "organizationId">, organizationId: string) {
  return prisma.customerGroup.create({ data: { ...input, organizationId } });
}

export async function update(id: string, input: Prisma.CustomerGroupUncheckedUpdateInput, organizationId: string) {
  await getById(id, organizationId);
  return prisma.customerGroup.update({ where: { id }, data: input });
}

export async function deactivate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.customerGroup.update({ where: { id }, data: { status: "INACTIVE" } });
}
