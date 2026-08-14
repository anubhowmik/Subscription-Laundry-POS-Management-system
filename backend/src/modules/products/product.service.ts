import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { NotFoundError } from "../../utils/AppError";
import { z } from "zod";
import { createProductSchema, updateProductSchema } from "./product.validators";
import { resolvePriceListId, getPriceOverrides } from "../priceLists/priceListResolver";

type CreateProductInput = z.infer<typeof createProductSchema>;
type UpdateProductInput = z.infer<typeof updateProductSchema>;

const SORTABLE_FIELDS = ["nameEn", "sellingPrice", "createdAt", "sku"];

function withStockTotal<T extends { stocks: { quantity: Prisma.Decimal }[] }>(product: T) {
  const totalStock = product.stocks.reduce((sum, s) => sum + Number(s.quantity), 0);
  return { ...product, totalStock };
}

export async function list(query: Record<string, unknown>, organizationId: string) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "nameEn");

  const where: Prisma.ProductWhereInput = {
    organizationId,
    deletedAt: null,
    ...(query.status ? { status: query.status as "ACTIVE" | "INACTIVE" } : {}),
    ...(query.categoryId ? { categoryId: String(query.categoryId) } : {}),
    ...(query.brandId ? { brandId: String(query.brandId) } : {}),
    ...(query.taxId ? { taxId: String(query.taxId) } : {}),
    ...(query.businessLocationId
      ? { businessLocations: { some: { businessLocationId: String(query.businessLocationId) } } }
      : {}),
    ...(query.minPrice || query.maxPrice
      ? {
          sellingPrice: {
            ...(query.minPrice ? { gte: Number(query.minPrice) } : {}),
            ...(query.maxPrice ? { lte: Number(query.maxPrice) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { nameEn: { contains: String(query.search), mode: "insensitive" } },
            { nameAr: { contains: String(query.search) } },
            { sku: { contains: String(query.search), mode: "insensitive" } },
            { barcode: { contains: String(query.search), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: { brand: true, category: true, unit: true, tax: true, stocks: true },
    }),
    prisma.product.count({ where }),
  ]);

  const priceListId = await resolvePriceListId(
    prisma,
    query.customerId ? String(query.customerId) : undefined,
    organizationId,
    query.businessLocationId ? String(query.businessLocationId) : undefined,
  );
  const { products: priceOverrides } = await getPriceOverrides(prisma, priceListId);
  const data = rows.map((row) => {
    const override = priceOverrides.get(row.id);
    return withStockTotal(override ? { ...row, sellingPrice: override } : row);
  });

  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const product = await prisma.product.findFirst({
    where: { id, organizationId, deletedAt: null },
    include: { brand: true, category: true, unit: true, tax: true, stocks: true, businessLocations: true },
  });
  if (!product) throw new NotFoundError("Product not found");
  return withStockTotal(product);
}

export async function create(input: CreateProductInput, createdBy: string, organizationId: string) {
  const { businessLocationIds, initialStock, ...rest } = input;

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({ data: { ...rest, createdBy, organizationId } });

    await tx.productBusinessLocation.createMany({
      data: businessLocationIds.map((businessLocationId) => ({ productId: product.id, businessLocationId })),
    });

    const qty = initialStock ?? 0;
    await tx.productStock.createMany({
      data: businessLocationIds.map((businessLocationId) => ({ productId: product.id, businessLocationId, quantity: qty })),
    });

    if (qty > 0) {
      await tx.inventoryTransaction.createMany({
        data: businessLocationIds.map((businessLocationId) => ({
          productId: product.id,
          businessLocationId,
          type: "STOCK_IN" as const,
          quantity: qty,
          balanceAfter: qty,
          referenceType: "PRODUCT_CREATED",
          note: "Initial stock on product creation",
          createdBy,
        })),
      });
    }

    return product;
  });
}

export async function update(id: string, input: UpdateProductInput, organizationId: string) {
  await getById(id, organizationId);
  const { businessLocationIds, ...rest } = input;

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.update({ where: { id }, data: rest });

    if (businessLocationIds) {
      const existing = await tx.productBusinessLocation.findMany({ where: { productId: id } });
      const existingIds = existing.map((e) => e.businessLocationId);
      const toAdd = businessLocationIds.filter((locId) => !existingIds.includes(locId));
      const toRemove = existingIds.filter((locId) => !businessLocationIds.includes(locId));

      if (toAdd.length > 0) {
        await tx.productBusinessLocation.createMany({
          data: toAdd.map((businessLocationId) => ({ productId: id, businessLocationId })),
        });
        await tx.productStock.createMany({
          data: toAdd.map((businessLocationId) => ({ productId: id, businessLocationId, quantity: 0 })),
          skipDuplicates: true,
        });
      }
      if (toRemove.length > 0) {
        await tx.productBusinessLocation.deleteMany({
          where: { productId: id, businessLocationId: { in: toRemove } },
        });
      }
    }

    return product;
  });
}

export async function deactivate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.product.update({ where: { id }, data: { status: "INACTIVE" } });
}
