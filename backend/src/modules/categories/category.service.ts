import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { NotFoundError } from "../../utils/AppError";

const SORTABLE_FIELDS = ["nameEn", "createdAt", "updatedAt"];

export async function list(query: Record<string, unknown>, organizationId: string) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "nameEn");

  const where: Prisma.CategoryWhereInput = {
    organizationId,
    ...(query.status ? { status: query.status as "ACTIVE" | "INACTIVE" } : {}),
    ...(query.parentId ? { parentId: String(query.parentId) } : {}),
    ...(query.search
      ? {
          OR: [
            { nameEn: { contains: String(query.search), mode: "insensitive" } },
            { nameAr: { contains: String(query.search) } },
            { code: { contains: String(query.search), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.category.findMany({ where, orderBy, skip, take: limit, include: { parent: true } }),
    prisma.category.count({ where }),
  ]);

  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const category = await prisma.category.findFirst({ where: { id, organizationId }, include: { parent: true, children: true } });
  if (!category) throw new NotFoundError("Category not found");
  return category;
}

export async function create(input: Omit<Prisma.CategoryUncheckedCreateInput, "organizationId">, organizationId: string) {
  return prisma.category.create({ data: { ...input, organizationId } });
}

export async function update(id: string, input: Prisma.CategoryUncheckedUpdateInput, organizationId: string) {
  await getById(id, organizationId);
  return prisma.category.update({ where: { id }, data: input });
}

export async function deactivate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.category.update({ where: { id }, data: { status: "INACTIVE" } });
}
