import { Prisma, type Discount } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError, NotFoundError } from "../../utils/AppError";
import { parsePagination } from "../../utils/pagination";
import { isRealCustomerGroup } from "../promotions/promotion.service";
import type { DiscountInput } from "./discount.validators";

const { Decimal } = Prisma;

// ---------------------------------------------------------------------------------------------
// Catalog (reference DiscountController)
// ---------------------------------------------------------------------------------------------

const listInclude = {
  businessLocation: { select: { branchName: true, branchNameAr: true, branchCode: true } },
  brand: { select: { nameEn: true, nameAr: true } },
  priceList: { select: { nameEn: true, nameAr: true } },
} as const;

/** Names for the item / category keys the listed discounts point at. */
async function keyNames(organizationId: string, rows: { itemKeys: string[]; categoryKey: string | null }[]) {
  const ids = (prefix: string, keys: string[]) => [...new Set(keys.filter((k) => k.startsWith(`${prefix}:`)).map((k) => k.slice(prefix.length + 1)))];
  const itemKeys = rows.flatMap((r) => r.itemKeys);
  const categoryKeys = rows.map((r) => r.categoryKey).filter((k): k is string => Boolean(k));
  const [products, services, categories, serviceCategories] = await Promise.all([
    prisma.product.findMany({ where: { organizationId, id: { in: ids("p", itemKeys) } }, select: { id: true, nameEn: true, nameAr: true, sku: true } }),
    prisma.service.findMany({ where: { organizationId, id: { in: ids("s", itemKeys) } }, select: { id: true, nameEn: true, nameAr: true, code: true } }),
    prisma.category.findMany({ where: { organizationId, id: { in: ids("pc", categoryKeys) } }, select: { id: true, nameEn: true, nameAr: true } }),
    prisma.serviceCategory.findMany({ where: { organizationId, id: { in: ids("sc", categoryKeys) } }, select: { id: true, nameEn: true, nameAr: true } }),
  ]);
  const names = new Map<string, { nameEn: string; nameAr: string | null; code?: string | null }>();
  for (const p of products) names.set(`p:${p.id}`, { nameEn: p.nameEn, nameAr: p.nameAr, code: p.sku });
  for (const s of services) names.set(`s:${s.id}`, { nameEn: s.nameEn, nameAr: s.nameAr, code: s.code });
  for (const c of categories) names.set(`pc:${c.id}`, c);
  for (const c of serviceCategories) names.set(`sc:${c.id}`, c);
  return names;
}

export async function list(query: Record<string, unknown>, organizationId: string) {
  const { page, limit, skip } = parsePagination(query);
  const where: Prisma.DiscountWhereInput = {
    organizationId,
    deletedAt: null,
    ...(query.search ? { name: { contains: String(query.search), mode: "insensitive" } } : {}),
    ...(query.businessLocationId ? { businessLocationId: String(query.businessLocationId) } : {}),
  };
  // Reference index(): no explicit order - newest first here.
  const [rows, total] = await Promise.all([
    prisma.discount.findMany({ where, include: listInclude, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.discount.count({ where }),
  ]);
  const names = await keyNames(organizationId, rows);
  const data = rows.map((r) => ({
    ...r,
    category: r.categoryKey ? (names.get(r.categoryKey) ?? null) : null,
    items: r.itemKeys.map((k) => ({ key: k, ...(names.get(k) ?? { nameEn: k, nameAr: null }) })),
  }));
  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const row = await prisma.discount.findFirst({ where: { id, organizationId, deletedAt: null }, include: listInclude });
  if (!row) throw new NotFoundError("Discount not found");
  return row;
}

async function assertRefsInOrg(input: DiscountInput, organizationId: string) {
  const loc = await prisma.businessLocation.findFirst({ where: { id: input.businessLocationId, organizationId } });
  if (!loc) throw new AppError(400, "Business location not found in this organization");
  if (input.brandId && !(await prisma.brand.findFirst({ where: { id: input.brandId, organizationId } }))) {
    throw new AppError(400, "Brand not found in this organization");
  }
  if (input.priceListId && !(await prisma.priceList.findFirst({ where: { id: input.priceListId, organizationId } }))) {
    throw new AppError(400, "Selling price group not found in this organization");
  }
  if (input.categoryKey) {
    const [kind, id] = input.categoryKey.split(":");
    const found =
      kind === "pc"
        ? await prisma.category.findFirst({ where: { id, organizationId } })
        : await prisma.serviceCategory.findFirst({ where: { id, organizationId } });
    if (!found) throw new AppError(400, "Category not found in this organization");
  }
  const ids = (prefix: string) => input.itemKeys.filter((k) => k.startsWith(`${prefix}:`)).map((k) => k.slice(prefix.length + 1));
  const [products, services] = await Promise.all([
    prisma.product.count({ where: { organizationId, id: { in: ids("p") } } }),
    prisma.service.count({ where: { organizationId, id: { in: ids("s") } } }),
  ]);
  if (products !== ids("p").length || services !== ids("s").length) throw new AppError(400, "Product not found in this organization");
}

function toData(input: DiscountInput) {
  const picked = input.itemKeys.length > 0;
  return {
    name: input.name,
    itemKeys: input.itemKeys,
    brandId: picked ? null : (input.brandId ?? null),
    categoryKey: picked ? null : (input.categoryKey ?? null),
    businessLocationId: input.businessLocationId,
    priority: input.priority ?? null,
    discountType: input.discountType,
    discountAmount: input.discountAmount,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    priceListId: input.priceListId ?? null,
    applicableInCg: input.applicableInCg,
    isActive: input.isActive,
  };
}

export async function create(input: DiscountInput, organizationId: string) {
  await assertRefsInOrg(input, organizationId);
  const row = await prisma.discount.create({ data: { ...toData(input), organizationId } });
  return getById(row.id, organizationId);
}

export async function update(id: string, input: DiscountInput, organizationId: string) {
  await getById(id, organizationId);
  await assertRefsInOrg(input, organizationId);
  await prisma.discount.update({ where: { id }, data: toData(input) });
  return getById(id, organizationId);
}

/** Reference destroy() - Discount uses SoftDeletes, so past invoice lines keep their link. */
export async function remove(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.discount.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
}

export async function activate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.discount.update({ where: { id }, data: { isActive: true } });
}

export async function massDeactivate(ids: string[], organizationId: string) {
  const { count } = await prisma.discount.updateMany({ where: { id: { in: ids }, organizationId, deletedAt: null }, data: { isActive: false } });
  return { count };
}

export async function formOptions(organizationId: string) {
  const [locations, brands, priceLists, categories, serviceCategories, products, services] = await Promise.all([
    prisma.businessLocation.findMany({ where: { organizationId }, select: { id: true, branchName: true, branchNameAr: true, branchCode: true }, orderBy: { branchCode: "asc" } }),
    prisma.brand.findMany({ where: { organizationId }, select: { id: true, nameEn: true, nameAr: true }, orderBy: { nameEn: "asc" } }),
    prisma.priceList.findMany({ where: { organizationId }, select: { id: true, nameEn: true, nameAr: true }, orderBy: { nameEn: "asc" } }),
    // Reference create(): main categories only (`parent_id = 0`).
    prisma.category.findMany({ where: { organizationId, parentId: null }, select: { id: true, nameEn: true, nameAr: true }, orderBy: { nameEn: "asc" } }),
    prisma.serviceCategory.findMany({ where: { organizationId }, select: { id: true, nameEn: true, nameAr: true }, orderBy: { nameEn: "asc" } }),
    prisma.product.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, nameEn: true, nameAr: true, sku: true }, orderBy: { nameEn: "asc" } }),
    prisma.service.findMany({ where: { organizationId }, select: { id: true, nameEn: true, nameAr: true, code: true }, orderBy: { nameEn: "asc" } }),
  ]);
  return {
    locations,
    brands,
    priceLists,
    categories: [
      ...categories.map((c) => ({ key: `pc:${c.id}`, nameEn: c.nameEn, nameAr: c.nameAr, kind: "PRODUCT" as const })),
      ...serviceCategories.map((c) => ({ key: `sc:${c.id}`, nameEn: c.nameEn, nameAr: c.nameAr, kind: "SERVICE" as const })),
    ],
    items: [
      ...products.map((p) => ({ key: `p:${p.id}`, nameEn: p.nameEn, nameAr: p.nameAr, code: p.sku, kind: "PRODUCT" as const })),
      ...services.map((s) => ({ key: `s:${s.id}`, nameEn: s.nameEn, nameAr: s.nameAr, code: s.code, kind: "SERVICE" as const })),
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// POS (reference ProductUtil::getProductDiscount)
// ---------------------------------------------------------------------------------------------

/**
 * The discount each item gets at a branch right now - the reference's getProductDiscount(): an
 * active discount of this branch whose window covers now, matching the item itself, or its brand
 * and/or main category; highest priority first, then the newest. A customer in a customer group
 * whose prices aren't editable only gets discounts ticked "Apply in customer groups"; a selling
 * price group limits a discount to sales priced with that group.
 *
 * Deliberate deviations, each fixing a reference defect:
 *  - A brand + category discount needs both to match. The reference matched a category-only
 *    product against any discount with that category, even one restricted to another brand.
 *  - A discount with no products / brand / category can't be saved. The reference let one
 *    through and then applied it only to products with neither a brand nor a category.
 *  - A product filed under a sub-category counts as its main category (the reference's products
 *    always carry the main category), and services match by their service category.
 *  - The Walk-in customer's own "Walk-in Customer" group isn't a customer group here (see
 *    isRealCustomerGroup) - the reference's walk-in contact has no group.
 */
export async function matchDiscounts(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; businessLocationId: string; customerGroupId: string | null; priceListId: string | null; itemKeys: string[]; now?: Date },
): Promise<Map<string, Discount>> {
  const result = new Map<string, Discount>();
  const keys = [...new Set(args.itemKeys)];
  if (!keys.length) return result;
  const now = args.now ?? new Date();

  let inCg = false;
  if (await isRealCustomerGroup(tx, args.organizationId, args.customerGroupId)) {
    const group = await tx.customerGroup.findUnique({ where: { id: args.customerGroupId! }, select: { priceEditable: true } });
    inCg = !group?.priceEditable;
  }
  const discounts = await tx.discount.findMany({
    where: {
      organizationId: args.organizationId,
      businessLocationId: args.businessLocationId,
      isActive: true,
      deletedAt: null,
      startsAt: { lte: now },
      endsAt: { gte: now },
      ...(inCg ? { applicableInCg: true } : {}),
      ...(args.priceListId ? { OR: [{ priceListId: null }, { priceListId: args.priceListId }] } : { priceListId: null }),
    },
  });
  if (!discounts.length) return result;
  discounts.sort((a, b) => {
    if (a.priority !== b.priority) {
      if (a.priority == null) return 1;
      if (b.priority == null) return -1;
      return b.priority - a.priority;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const ids = (prefix: string) => keys.filter((k) => k.startsWith(`${prefix}:`)).map((k) => k.slice(prefix.length + 1));
  const [products, services, categories] = await Promise.all([
    tx.product.findMany({ where: { organizationId: args.organizationId, id: { in: ids("p") } }, select: { id: true, brandId: true, categoryId: true } }),
    tx.service.findMany({ where: { organizationId: args.organizationId, id: { in: ids("s") } }, select: { id: true, categoryId: true } }),
    tx.category.findMany({ where: { organizationId: args.organizationId }, select: { id: true, parentId: true } }),
  ]);
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  const topOf = (id: string) => {
    let current = id;
    for (let guard = 0; guard < 10; guard++) {
      const parent = parentOf.get(current);
      if (!parent) return current;
      current = parent;
    }
    return current;
  };
  const meta = new Map<string, { brandId: string | null; categoryKey: string | null }>();
  for (const p of products) meta.set(`p:${p.id}`, { brandId: p.brandId, categoryKey: p.categoryId ? `pc:${topOf(p.categoryId)}` : null });
  for (const s of services) meta.set(`s:${s.id}`, { brandId: null, categoryKey: s.categoryId ? `sc:${s.categoryId}` : null });

  for (const key of keys) {
    const m = meta.get(key);
    if (!m) continue;
    const hit = discounts.find(
      (d) =>
        d.itemKeys.includes(key) ||
        ((d.brandId != null || d.categoryKey != null) &&
          (d.brandId == null || d.brandId === m.brandId) &&
          (d.categoryKey == null || d.categoryKey === m.categoryKey)),
    );
    if (hit) result.set(key, hit);
  }
  return result;
}

/**
 * A discount's amount on one cart line. Reference line discounts: "percentage" is a percent of
 * the line, "fixed" is an amount off each unit (never more than the unit price).
 */
export function discountAmountFor(d: Pick<Discount, "discountType" | "discountAmount">, unitPrice: Prisma.Decimal, quantity: Prisma.Decimal) {
  const gross = unitPrice.mul(quantity);
  const amount =
    d.discountType === "PERCENTAGE" ? gross.mul(Decimal.min(d.discountAmount, 100)).div(100) : Decimal.min(d.discountAmount, unitPrice).mul(quantity);
  return Decimal.max(0, Decimal.min(amount, gross)).toDecimalPlaces(2);
}
