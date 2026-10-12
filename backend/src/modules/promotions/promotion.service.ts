import { Prisma, type PromotionType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError, NotFoundError } from "../../utils/AppError";
import { parsePagination } from "../../utils/pagination";
import {
  evaluatePromotion,
  isPromotionActiveNow,
  sortByPriority,
  type EngineContext,
  type EngineLine,
  type PromotionResult,
  type PromotionWithLines,
} from "./promotionEngine";
import type { PromotionInput } from "./promotion.validators";

const { Decimal } = Prisma;

// ---------------------------------------------------------------------------------------------
// Catalog (reference PromotionsController)
// ---------------------------------------------------------------------------------------------

export async function list(query: Record<string, unknown>, organizationId: string) {
  const { page, limit, skip } = parsePagination(query);
  const where: Prisma.PromotionWhereInput = {
    organizationId,
    deletedAt: null,
    ...(query.search ? { name: { contains: String(query.search), mode: "insensitive" } } : {}),
    ...(query.type ? { type: String(query.type) as PromotionType } : {}),
    ...(query.status === "active" ? { isActive: true } : query.status === "inactive" ? { isActive: false } : {}),
  };
  // Reference index(): newest first.
  const [data, total] = await Promise.all([
    prisma.promotion.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.promotion.count({ where }),
  ]);
  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const promotion = await prisma.promotion.findFirst({
    where: { id, organizationId, deletedAt: null },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!promotion) throw new NotFoundError("Promotion not found");
  // Customers are picked by search, so the form needs the picked ones' names back.
  const customerIds = [...new Set([...promotion.customerIds, ...promotion.excludeCustomerIds])];
  const customers = customerIds.length
    ? await prisma.customer.findMany({ where: { id: { in: customerIds }, organizationId }, select: { id: true, code: true, nameEn: true, nameAr: true, phone: true } })
    : [];
  return { ...promotion, customers };
}

/** Every id/key a promotion points at must belong to the caller's own organization. */
async function assertRefsInOrg(input: PromotionInput, organizationId: string) {
  const check = async (label: string, ids: string[], count: (ids: string[]) => Promise<number>) => {
    const unique = [...new Set(ids)];
    if (unique.length && (await count(unique)) !== unique.length) throw new AppError(400, `${label} not found in this organization`);
  };
  const byKey = (keys: string[], prefix: string) => keys.filter((k) => k.startsWith(`${prefix}:`)).map((k) => k.slice(prefix.length + 1));
  const itemKeys = [...input.itemKeys, ...input.excludeItemKeys, ...input.giftItemKeys, ...input.lines.flatMap((l) => [l.itemKey, l.giftItemKey])];
  const categoryKeys = [...input.categoryKeys, ...input.excludeCategoryKeys];

  await check("Business location", [...input.businessLocationIds, ...input.excludeBusinessLocationIds], (ids) =>
    prisma.businessLocation.count({ where: { id: { in: ids }, organizationId } }),
  );
  await check("Location group", input.locationGroupIds, (ids) => prisma.businessLocationGroup.count({ where: { id: { in: ids }, organizationId } }));
  await check("Customer group", input.customerGroupIds, (ids) => prisma.customerGroup.count({ where: { id: { in: ids }, organizationId } }));
  await check("Selling price group", input.priceListIds, (ids) => prisma.priceList.count({ where: { id: { in: ids }, organizationId } }));
  await check("Customer", [...input.customerIds, ...input.excludeCustomerIds], (ids) => prisma.customer.count({ where: { id: { in: ids }, organizationId } }));
  await check("Brand", input.brandIds, (ids) => prisma.brand.count({ where: { id: { in: ids }, organizationId } }));
  await check("Category", byKey(categoryKeys, "pc"), (ids) => prisma.category.count({ where: { id: { in: ids }, organizationId } }));
  await check("Service category", byKey(categoryKeys, "sc"), (ids) => prisma.serviceCategory.count({ where: { id: { in: ids }, organizationId } }));
  await check("Product", byKey(itemKeys, "p"), (ids) => prisma.product.count({ where: { id: { in: ids }, organizationId } }));
  await check("Service", byKey(itemKeys, "s"), (ids) => prisma.service.count({ where: { id: { in: ids }, organizationId } }));
}

/**
 * Maps the validated form onto the row, clearing whatever the chosen type doesn't use - the
 * reference's `#p_type` change handler blanks those inputs the same way before submit.
 */
function toData(input: PromotionInput) {
  const t = input.type;
  const usesDiscount = t === "TRADITIONAL_DISCOUNT" || t === "QUANTITY_DISCOUNT" || t === "PRICE_DISCOUNT";
  const giftByQuantity = t === "PRODUCT_GIFTS" && input.checkCondition === "quantity";
  const usesSalesQty = t === "QUANTITY_DISCOUNT" || t === "BOUNCE" || giftByQuantity;
  const usesSalesAmount = t === "PRICE_DISCOUNT" || (t === "PRODUCT_GIFTS" && !giftByQuantity);
  // Multiple Products Discount hides the whole item-condition block (`.product_condition`).
  const itemConditions = t !== "MULTIPLE_DISCOUNT";
  const isCashBack = t === "CASH_BACK";
  return {
    name: input.name,
    type: t,
    salesQuantity: usesSalesQty ? (input.salesQuantity ?? null) : null,
    salesAmount: usesSalesAmount ? (input.salesAmount ?? null) : null,
    locationGroupIds: input.locationGroupIds,
    businessLocationIds: input.businessLocationIds,
    excludeBusinessLocationIds: input.excludeBusinessLocationIds,
    // The reference disables the Customer Group picker while "Exclude Customer Group" is ticked.
    customerGroupIds: input.excludeCustomerGroup ? [] : input.customerGroupIds,
    priceListIds: input.priceListIds,
    customerIds: input.customerIds,
    excludeCustomerIds: input.excludeCustomerIds,
    categoryKeys: itemConditions ? input.categoryKeys : [],
    excludeCategoryKeys: itemConditions ? input.excludeCategoryKeys : [],
    brandIds: itemConditions ? input.brandIds : [],
    itemKeys: itemConditions ? input.itemKeys : [],
    excludeItemKeys: itemConditions ? input.excludeItemKeys : [],
    applyIfAllProductsExist: itemConditions ? input.applyIfAllProductsExist : false,
    startsAt: input.startsAt ? new Date(`${input.startsAt}T00:00:00Z`) : null,
    endsAt: input.endsAt ? new Date(`${input.endsAt}T00:00:00Z`) : null,
    days: input.days,
    periods: input.periods.length ? input.periods : Prisma.DbNull,
    discountType: usesDiscount ? (input.discountType ?? null) : null,
    discountAmount: usesDiscount ? (input.discountAmount ?? null) : null,
    daQuantity: t === "QUANTITY_DISCOUNT" ? (input.daQuantity ?? null) : null,
    bounceQuantity: t === "BOUNCE" ? (input.bounceQuantity ?? null) : null,
    giftQuantity: t === "PRODUCT_GIFTS" ? (input.giftQuantity ?? null) : null,
    giftItemKeys: t === "PRODUCT_GIFTS" ? input.giftItemKeys : [],
    priority: input.priority ?? null,
    isActive: input.isActive,
    autoApply: input.autoApply,
    // The cash back form only carries priority / active / auto apply of these switches.
    fullCash: isCashBack ? false : input.fullCash,
    expeditedDiscount: isCashBack ? true : input.expeditedDiscount,
    excludeCustomerGroup: input.excludeCustomerGroup,
    cashBackValue: isCashBack ? (input.cashBackValue ?? null) : null,
    pointsForCashBack: isCashBack ? (input.pointsForCashBack ?? null) : null,
    cashBackExpirationDays: isCashBack ? (input.cashBackExpirationDays ?? null) : null,
    redeemAfterEnd: isCashBack ? input.redeemAfterEnd : false,
  };
}

const linesData = (input: PromotionInput) =>
  input.type === "MULTIPLE_DISCOUNT"
    ? input.lines.map((l, i) => ({
        itemKey: l.itemKey,
        quantity: l.quantity,
        giftItemKey: l.giftItemKey,
        giftQuantity: l.giftQuantity,
        discountPercent: l.discountPercent,
        sortOrder: i,
      }))
    : [];

export async function create(input: PromotionInput, organizationId: string, createdBy: string) {
  await assertRefsInOrg(input, organizationId);
  const row = await prisma.promotion.create({
    data: { ...toData(input), organizationId, createdBy, lines: { create: linesData(input) } },
  });
  return getById(row.id, organizationId);
}

export async function update(id: string, input: PromotionInput, organizationId: string) {
  await getById(id, organizationId);
  await assertRefsInOrg(input, organizationId);
  await prisma.$transaction([
    prisma.promotionLine.deleteMany({ where: { promotionId: id } }),
    prisma.promotion.update({ where: { id }, data: { ...toData(input), lines: { create: linesData(input) } } }),
  ]);
  return getById(id, organizationId);
}

/** Reference destroy(): a soft delete (Promotion uses SoftDeletes) - past invoices keep their link. */
export async function remove(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.promotion.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
}

/** Reference activate() - the "Reactivate" action on an inactive row. */
export async function activate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.promotion.update({ where: { id }, data: { isActive: true } });
}

/** Reference massDeactivate() - "Deactivate Selected". */
export async function massDeactivate(ids: string[], organizationId: string) {
  const { count } = await prisma.promotion.updateMany({ where: { id: { in: ids }, organizationId, deletedAt: null }, data: { isActive: false } });
  return { count };
}

/** Pickers for the promotion form. */
export async function formOptions(organizationId: string) {
  const [locations, locationGroups, customerGroups, priceLists, categories, serviceCategories, brands, products, services] = await Promise.all([
    prisma.businessLocation.findMany({
      where: { organizationId },
      select: { id: true, branchName: true, branchNameAr: true, branchCode: true },
      orderBy: { branchCode: "asc" },
    }),
    prisma.businessLocationGroup.findMany({ where: { organizationId }, select: { id: true, nameEn: true, nameAr: true }, orderBy: { nameEn: "asc" } }),
    prisma.customerGroup.findMany({ where: { organizationId }, select: { id: true, nameEn: true, nameAr: true }, orderBy: { nameEn: "asc" } }),
    prisma.priceList.findMany({ where: { organizationId }, select: { id: true, nameEn: true, nameAr: true }, orderBy: { nameEn: "asc" } }),
    // Reference create(): main categories only (`parent_id = 0`).
    prisma.category.findMany({ where: { organizationId, parentId: null }, select: { id: true, nameEn: true, nameAr: true }, orderBy: { nameEn: "asc" } }),
    prisma.serviceCategory.findMany({ where: { organizationId }, select: { id: true, nameEn: true, nameAr: true }, orderBy: { nameEn: "asc" } }),
    prisma.brand.findMany({ where: { organizationId }, select: { id: true, nameEn: true, nameAr: true }, orderBy: { nameEn: "asc" } }),
    prisma.product.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, nameEn: true, nameAr: true, sku: true }, orderBy: { nameEn: "asc" } }),
    prisma.service.findMany({ where: { organizationId }, select: { id: true, nameEn: true, nameAr: true, code: true }, orderBy: { nameEn: "asc" } }),
  ]);
  return {
    locations,
    locationGroups,
    customerGroups,
    priceLists,
    brands,
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
// POS side (reference SellPosController@applyPromotion / TransactionUtil::getActivePromotions)
// ---------------------------------------------------------------------------------------------

/** Reference getActivePromotions(): what the POS "Promotion" dropdown offers right now. */
export async function listActive(organizationId: string) {
  const rows = await prisma.promotion.findMany({
    where: { organizationId, isActive: true, deletedAt: null },
    select: { id: true, name: true, type: true, autoApply: true, fullCash: true, priority: true, createdAt: true, isActive: true, deletedAt: true, startsAt: true, endsAt: true, days: true, periods: true },
  });
  const now = new Date();
  return sortByPriority(rows.filter((p) => isPromotionActiveNow(p, now))).map(({ id, name, type, autoApply, fullCash }) => ({ id, name, type, autoApply, fullCash }));
}

/** One priced cart row, as checkout() has it after priceLine(). */
export interface PricedCartRow {
  productId?: string;
  serviceId?: string;
  pieces: Prisma.Decimal; // entered quantity (pieces)
  areaFactor: Prisma.Decimal; // widthM x heightM, or 1
  unitPrice: Prisma.Decimal; // per billed unit
  total: Prisma.Decimal; // incl. tax, after the row's own manual discount
}

export interface ResolvedPromotion {
  promotion: PromotionWithLines;
  result: PromotionResult;
}

/**
 * Picks and evaluates the promotion for a cart. An explicit `promotionId` (the cashier picked it
 * from the dropdown) must match or the sale is refused; without one the auto-apply promotions
 * are tried highest priority first and the first that matches wins - the reference runs exactly
 * this on Finalize/Draft when no promotion was applied by hand.
 *
 * With a coupon on the cart: a coupon without "Added Discount" never combines with a promotion
 * (the reference cancels the promotion and disables the button); one with "Added Discount" keeps a
 * promotion the cashier picked by hand, but nothing is auto-applied next to it - the coupon was
 * fitted to the cart as the cashier saw it.
 */
export async function resolvePromotion(
  tx: Prisma.TransactionClient,
  args: {
    organizationId: string;
    promotionId?: string;
    coupon?: { addedDiscount: boolean } | null;
    businessLocation: { id: string; groupId: string | null };
    customer: { id: string; customerGroupId: string | null; priceListId: string | null };
    rows: PricedCartRow[];
  },
): Promise<ResolvedPromotion | null> {
  if (args.coupon) {
    if (!args.coupon.addedDiscount) {
      if (args.promotionId) throw new AppError(400, "Remove the coupon before applying a promotion");
      return null;
    }
    if (!args.promotionId) return null;
  }
  const now = new Date();
  const candidates = args.promotionId
    ? await tx.promotion.findMany({ where: { id: args.promotionId, organizationId: args.organizationId, deletedAt: null }, include: { lines: true } })
    : await tx.promotion.findMany({ where: { organizationId: args.organizationId, deletedAt: null, isActive: true, autoApply: true }, include: { lines: true } });
  if (args.promotionId) {
    if (!candidates.length) throw new NotFoundError("Promotion not found");
    if (!isPromotionActiveNow(candidates[0], now)) throw new AppError(400, "Promotion not active now!");
  }
  if (!candidates.length) return null;

  const lines = await buildEngineLines(tx, args.organizationId, args.rows);
  const inCustomerGroup = await isRealCustomerGroup(tx, args.organizationId, args.customer.customerGroupId);
  const ctx: EngineContext = {
    businessLocationId: args.businessLocation.id,
    businessLocationGroupId: args.businessLocation.groupId,
    customer: { ...args.customer, inCustomerGroup },
    now,
  };
  for (const promotion of sortByPriority(candidates)) {
    const result = evaluatePromotion(promotion, lines, ctx);
    if (result.applied) return { promotion, result };
  }
  if (args.promotionId) throw new AppError(400, "Conditions do not match");
  return null;
}

export async function buildEngineLines(tx: Prisma.TransactionClient, organizationId: string, rows: PricedCartRow[]): Promise<EngineLine[]> {
  const productIds = [...new Set(rows.map((r) => r.productId).filter((id): id is string => Boolean(id)))];
  const serviceIds = [...new Set(rows.map((r) => r.serviceId).filter((id): id is string => Boolean(id)))];
  const [products, services, categories] = await Promise.all([
    productIds.length ? tx.product.findMany({ where: { id: { in: productIds }, organizationId }, select: { id: true, categoryId: true, brandId: true } }) : [],
    serviceIds.length ? tx.service.findMany({ where: { id: { in: serviceIds }, organizationId }, select: { id: true, categoryId: true } }) : [],
    productIds.length ? tx.category.findMany({ where: { organizationId }, select: { id: true, parentId: true } }) : [],
  ]);
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  // Reference categories are main categories (a product's category_id) - a product filed under
  // a sub-category here counts as its main category.
  const topOf = (id: string) => {
    let current = id;
    for (let guard = 0; guard < 10; guard++) {
      const parent = parentOf.get(current);
      if (!parent) return current;
      current = parent;
    }
    return current;
  };
  const productById = new Map(products.map((p) => [p.id, p]));
  const serviceById = new Map(services.map((s) => [s.id, s]));
  return rows.map((r) => {
    const product = r.productId ? productById.get(r.productId) : undefined;
    const service = r.serviceId ? serviceById.get(r.serviceId) : undefined;
    return {
      key: r.productId ? `p:${r.productId}` : `s:${r.serviceId}`,
      categoryKey: product?.categoryId ? `pc:${topOf(product.categoryId)}` : service?.categoryId ? `sc:${service.categoryId}` : null,
      brandId: product?.brandId ?? null,
      pieces: r.pieces,
      perPiecePrice: r.unitPrice.mul(r.areaFactor),
      amount: r.total,
    };
  });
}

/** Reference calcuateCashBackForPromotion(): final total x cash back value / points for cash back. */
export function cashBackAmount(promotion: { cashBackValue: Prisma.Decimal | null; pointsForCashBack: Prisma.Decimal | null }, base: Prisma.Decimal) {
  if (!promotion.cashBackValue || !promotion.pointsForCashBack || promotion.pointsForCashBack.lte(0)) return new Decimal(0);
  return Decimal.max(0, base.mul(promotion.cashBackValue).div(promotion.pointsForCashBack)).toDecimalPlaces(2);
}

/**
 * Reference pos_form_totals.blade.php: while a Cash back promotion with "Redeem After Offer
 * Expiry" is running, cash back can't be spent at the POS.
 */
export async function assertCashbackRedeemAllowed(tx: Prisma.TransactionClient, organizationId: string) {
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const day = new Date(`${ymd}T00:00:00Z`);
  const blocking = await tx.promotion.findFirst({
    where: { organizationId, type: "CASH_BACK", isActive: true, deletedAt: null, redeemAfterEnd: true, startsAt: { lte: day }, endsAt: { gte: day } },
    select: { name: true },
  });
  if (blocking) throw new AppError(400, `There is an active cash back offer (${blocking.name}). Cash back can't be redeemed until the offer ends.`);
}

export async function hasCashbackRedeemBlock(organizationId: string) {
  try {
    await assertCashbackRedeemAllowed(prisma, organizationId);
    return false;
  } catch {
    return true;
  }
}

/**
 * Whether a customer's group is a real customer group (a company account). This app files the
 * Walk-in customer under its own auto-created "Walk-in Customer" group, which doesn't count - the
 * reference's walk-in contact has no group at all.
 */
export async function isRealCustomerGroup(tx: Prisma.TransactionClient, organizationId: string, customerGroupId: string | null) {
  if (!customerGroupId) return false;
  const walkIn = await tx.customer.findFirst({ where: { organizationId, code: "WALKIN" }, select: { customerGroupId: true } });
  return customerGroupId !== walkIn?.customerGroupId;
}
