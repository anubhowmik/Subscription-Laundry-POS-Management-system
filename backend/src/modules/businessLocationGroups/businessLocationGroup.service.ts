import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination } from "../../utils/pagination";
import { NotFoundError, ConflictError } from "../../utils/AppError";

export async function list(query: Record<string, unknown>, organizationId: string) {
  const { page, limit, skip } = parsePagination(query);
  const where: Prisma.BusinessLocationGroupWhereInput = {
    organizationId,
    ...(query.search ? { OR: [{ nameEn: { contains: String(query.search), mode: "insensitive" } }, { nameAr: { contains: String(query.search) } }] } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.businessLocationGroup.findMany({ where, orderBy: { nameEn: "asc" }, skip, take: limit }),
    prisma.businessLocationGroup.count({ where }),
  ]);
  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const group = await prisma.businessLocationGroup.findFirst({ where: { id, organizationId } });
  if (!group) throw new NotFoundError("Business location group not found");
  return group;
}

export async function create(input: Omit<Prisma.BusinessLocationGroupUncheckedCreateInput, "organizationId">, organizationId: string) {
  return prisma.businessLocationGroup.create({ data: { ...input, organizationId } });
}

export async function update(id: string, input: Prisma.BusinessLocationGroupUncheckedUpdateInput, organizationId: string) {
  await getById(id, organizationId);
  return prisma.businessLocationGroup.update({ where: { id }, data: input });
}

export async function remove(id: string, organizationId: string) {
  await getById(id, organizationId);
  const locationCount = await prisma.businessLocation.count({ where: { groupId: id } });
  if (locationCount > 0) throw new ConflictError("Cannot delete a group that still has branches assigned to it");
  await prisma.businessLocationGroup.delete({ where: { id } });
}
