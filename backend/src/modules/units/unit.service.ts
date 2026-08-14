import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { NotFoundError } from "../../utils/AppError";

const SORTABLE_FIELDS = ["nameEn", "createdAt", "updatedAt"];

export async function list(query: Record<string, unknown>, organizationId: string) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "nameEn");

  const where: Prisma.UnitWhereInput = {
    organizationId,
    ...(query.status ? { status: query.status as "ACTIVE" | "INACTIVE" } : {}),
    ...(query.search
      ? { OR: [{ nameEn: { contains: String(query.search), mode: "insensitive" } }, { shortName: { contains: String(query.search), mode: "insensitive" } }] }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.unit.findMany({ where, orderBy, skip, take: limit, include: { baseUnit: true } }),
    prisma.unit.count({ where }),
  ]);
  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const unit = await prisma.unit.findFirst({ where: { id, organizationId }, include: { baseUnit: true, subUnits: true } });
  if (!unit) throw new NotFoundError("Unit not found");
  return unit;
}

export async function create(input: Omit<Prisma.UnitUncheckedCreateInput, "organizationId">, organizationId: string) {
  return prisma.unit.create({ data: { ...input, organizationId } });
}

export async function update(id: string, input: Prisma.UnitUncheckedUpdateInput, organizationId: string) {
  await getById(id, organizationId);
  return prisma.unit.update({ where: { id }, data: input });
}

export async function deactivate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.unit.update({ where: { id }, data: { status: "INACTIVE" } });
}
