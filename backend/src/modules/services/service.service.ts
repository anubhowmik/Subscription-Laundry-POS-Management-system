import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { NotFoundError } from "../../utils/AppError";
import { z } from "zod";
import { createServiceSchema, updateServiceSchema } from "./service.validators";
import { resolvePriceListId, getPriceOverrides } from "../priceLists/priceListResolver";

type CreateServiceInput = z.infer<typeof createServiceSchema>;
type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

const SORTABLE_FIELDS = ["nameEn", "price", "createdAt"];

export async function list(query: Record<string, unknown>, organizationId: string) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "nameEn");

  const where: Prisma.ServiceWhereInput = {
    organizationId,
    ...(query.status ? { status: query.status as "ACTIVE" | "INACTIVE" } : {}),
    ...(query.categoryId ? { categoryId: String(query.categoryId) } : {}),
    ...(query.businessLocationId
      ? { businessLocations: { some: { businessLocationId: String(query.businessLocationId) } } }
      : {}),
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

  const [rows, total] = await Promise.all([
    prisma.service.findMany({ where, orderBy, skip, take: limit, include: { category: true, unit: true, tax: true } }),
    prisma.service.count({ where }),
  ]);

  const priceListId = await resolvePriceListId(
    prisma,
    query.customerId ? String(query.customerId) : undefined,
    organizationId,
    query.businessLocationId ? String(query.businessLocationId) : undefined,
  );
  const { services: priceOverrides } = await getPriceOverrides(prisma, priceListId);
  const data = rows.map((row) => {
    const override = priceOverrides.get(row.id);
    return override ? { ...row, price: override } : row;
  });

  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const service = await prisma.service.findFirst({
    where: { id, organizationId },
    include: { category: true, unit: true, tax: true, businessLocations: true },
  });
  if (!service) throw new NotFoundError("Service not found");
  return service;
}

export async function create(input: CreateServiceInput, organizationId: string) {
  const { businessLocationIds, ...rest } = input;
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.create({ data: { ...rest, organizationId } });
    await tx.serviceBusinessLocation.createMany({
      data: businessLocationIds.map((businessLocationId) => ({ serviceId: service.id, businessLocationId })),
    });
    return service;
  });
}

export async function update(id: string, input: UpdateServiceInput, organizationId: string) {
  await getById(id, organizationId);
  const { businessLocationIds, ...rest } = input;

  return prisma.$transaction(async (tx) => {
    const service = await tx.service.update({ where: { id }, data: rest });

    if (businessLocationIds) {
      const existing = await tx.serviceBusinessLocation.findMany({ where: { serviceId: id } });
      const existingIds = existing.map((e) => e.businessLocationId);
      const toAdd = businessLocationIds.filter((locId) => !existingIds.includes(locId));
      const toRemove = existingIds.filter((locId) => !businessLocationIds.includes(locId));

      if (toAdd.length > 0) {
        await tx.serviceBusinessLocation.createMany({
          data: toAdd.map((businessLocationId) => ({ serviceId: id, businessLocationId })),
        });
      }
      if (toRemove.length > 0) {
        await tx.serviceBusinessLocation.deleteMany({ where: { serviceId: id, businessLocationId: { in: toRemove } } });
      }
    }

    return service;
  });
}

export async function deactivate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.service.update({ where: { id }, data: { status: "INACTIVE" } });
}
