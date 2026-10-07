import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { NotFoundError, ValidationError } from "../../utils/AppError";

const SORTABLE_FIELDS = ["nameEn", "createdAt", "updatedAt"];

export async function list(query: Record<string, unknown>, organizationId: string) {
  // Categories are a short list that every product form / POS filter loads in one go, so default
  // to the whole list (the generic default of 25 silently hid categories past the 25th).
  const { page, limit, skip } = parsePagination({ limit: 1000, ...query }, 1000);
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

/**
 * Categories are two levels deep, like the reference's taxonomies: a sub-category's parent must be a
 * top-level category of the same business, and a category that has sub-categories can't itself
 * become one.
 */
async function assertValidParent(parentId: string | null | undefined, organizationId: string, selfId?: string) {
  if (!parentId) return;
  if (parentId === selfId) throw new ValidationError([{ field: "parentId", message: "A category can't be its own parent" }]);
  const parent = await prisma.category.findFirst({ where: { id: parentId, organizationId }, select: { parentId: true } });
  if (!parent) throw new ValidationError([{ field: "parentId", message: "Parent category not found" }]);
  if (parent.parentId) throw new ValidationError([{ field: "parentId", message: "A sub-category can't have sub-categories" }]);
  if (selfId && (await prisma.category.count({ where: { parentId: selfId } })) > 0) {
    throw new ValidationError([{ field: "parentId", message: "This category has sub-categories, so it can't become one" }]);
  }
}

export async function create(input: Omit<Prisma.CategoryUncheckedCreateInput, "organizationId">, organizationId: string) {
  await assertValidParent(input.parentId, organizationId);
  return prisma.category.create({ data: { ...input, organizationId } });
}

export async function update(id: string, input: Prisma.CategoryUncheckedUpdateInput, organizationId: string) {
  await getById(id, organizationId);
  if (input.parentId !== undefined) await assertValidParent(input.parentId as string | null, organizationId, id);
  return prisma.category.update({ where: { id }, data: input });
}

export async function deactivate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.category.update({ where: { id }, data: { status: "INACTIVE" } });
}
