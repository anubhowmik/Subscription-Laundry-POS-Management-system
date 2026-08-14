import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { NotFoundError } from "../../utils/AppError";
import { InvoiceLayoutSettingsInput } from "./businessLocation.validators";

const SORTABLE_FIELDS = ["branchName", "createdAt"];

export async function list(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "branchName");

  const where: Prisma.BusinessLocationWhereInput = {
    organizationId,
    ...(query.status ? { status: query.status as "ACTIVE" | "INACTIVE" } : {}),
    ...(allowedLocationIds ? { id: { in: allowedLocationIds } } : {}),
    ...(query.search
      ? {
          OR: [
            { branchName: { contains: String(query.search), mode: "insensitive" } },
            { branchCode: { contains: String(query.search), mode: "insensitive" } },
            { businessNameEn: { contains: String(query.search), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.businessLocation.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: { group: { select: { nameEn: true, nameAr: true } }, defaultPriceList: { select: { nameEn: true, nameAr: true } } },
    }),
    prisma.businessLocation.count({ where }),
  ]);
  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const location = await prisma.businessLocation.findFirst({
    where: { id, organizationId },
    include: { group: { select: { nameEn: true, nameAr: true } }, defaultPriceList: { select: { nameEn: true, nameAr: true } } },
  });
  if (!location) throw new NotFoundError("Business location not found");
  return location;
}

export async function create(input: Omit<Prisma.BusinessLocationUncheckedCreateInput, "organizationId">, organizationId: string) {
  return prisma.businessLocation.create({ data: { ...input, organizationId } });
}

export async function update(id: string, input: Prisma.BusinessLocationUncheckedUpdateInput, organizationId: string) {
  await getById(id, organizationId);
  return prisma.businessLocation.update({ where: { id }, data: input });
}

export async function deactivate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.businessLocation.update({ where: { id }, data: { status: "INACTIVE" } });
}

/** Returns null (not a default row) when the branch hasn't customized anything yet - the
 * frontend already knows how to render a fully-default layout without a row existing. */
export async function getInvoiceLayout(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.invoiceLayoutSettings.findUnique({ where: { businessLocationId: id } });
}

export async function upsertInvoiceLayout(id: string, input: InvoiceLayoutSettingsInput, organizationId: string) {
  await getById(id, organizationId);
  // Json columns need the Prisma.JsonNull sentinel to actually clear to DB null - plain `null`
  // would be ambiguous with "field not provided" for Prisma's typing here.
  const labelOverrides =
    input.labelOverrides === null ? Prisma.JsonNull : input.labelOverrides === undefined ? undefined : input.labelOverrides;
  return prisma.invoiceLayoutSettings.upsert({
    where: { businessLocationId: id },
    create: { businessLocationId: id, ...input, labelOverrides },
    update: { ...input, labelOverrides },
  });
}
