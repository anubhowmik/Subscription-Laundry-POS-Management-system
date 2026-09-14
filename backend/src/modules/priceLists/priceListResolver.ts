import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

type PrismaClientLike = typeof prisma | Prisma.TransactionClient;

/**
 * A customer's own price list wins over their group's, which wins over the branch's default
 * (see the Customer.priceListId and BusinessLocation.defaultPriceListId schema comments). Shared
 * by every place that prices a product/service for a specific customer - the POS grid, checkout,
 * and any future module - so they can never disagree, the same guarantee enforced for coupons
 * after the preview/checkout mismatch bugs found in P1-4.
 */
export async function resolvePriceListId(
  client: PrismaClientLike,
  customerId: string | undefined,
  organizationId: string,
  businessLocationId?: string,
): Promise<string | null> {
  const locationFallback = businessLocationId
    ? (await client.businessLocation.findFirst({ where: { id: businessLocationId, organizationId }, select: { defaultPriceListId: true } }))
        ?.defaultPriceListId ?? null
    : null;

  if (!customerId) return locationFallback;
  const customer = await client.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { priceListId: true, customerGroup: { select: { priceListId: true, priceCalculationType: true } } },
  });
  if (!customer) return locationFallback;
  // A group's price list only applies in SELLING_PRICE_GROUP mode - in PERCENTAGE mode,
  // resolveGroupDiscountPercent below is what actually adjusts pricing instead (see the EJADA
  // reference's mutually-exclusive price_calculation_type radio on CustomerGroup).
  const groupPriceListId = customer.customerGroup?.priceCalculationType === "SELLING_PRICE_GROUP" ? customer.customerGroup.priceListId : null;
  return customer.priceListId ?? groupPriceListId ?? locationFallback;
}

/**
 * The customer's group's percentage-based price adjustment (EJADA reference's
 * `price_calculation_type = 'percentage'` mode) - 0 when the customer has no group, the group is
 * in SELLING_PRICE_GROUP mode instead, or the group's own `discountPercent` is unset. A positive
 * value discounts the base price; the reference itself notes it can also be negative to mark
 * prices up. Applied as a straight percentage of whatever price the product/service (or its
 * resolved price list override) already computed to - matching how a customer's own `priceListId`
 * still wins over the group's calculation type entirely (see resolvePriceListId above).
 */
export async function resolveGroupDiscountPercent(
  client: PrismaClientLike,
  customerId: string | undefined,
  organizationId: string,
): Promise<Prisma.Decimal> {
  const zero = new Prisma.Decimal(0);
  if (!customerId) return zero;
  const customer = await client.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { priceListId: true, customerGroup: { select: { priceCalculationType: true, discountPercent: true } } },
  });
  // A customer's own price list wins over the group's calculation type entirely - same priority
  // order as resolvePriceListId.
  if (!customer || customer.priceListId || !customer.customerGroup) return zero;
  if (customer.customerGroup.priceCalculationType !== "PERCENTAGE") return zero;
  return customer.customerGroup.discountPercent;
}

/** Applies a percentage adjustment to a base price - shared by every place that prices a line
 * item, so the POS grid preview and the actual checkout price a product/service identically. */
export function applyPercentAdjustment(basePrice: Prisma.Decimal, percent: Prisma.Decimal): Prisma.Decimal {
  if (percent.isZero()) return basePrice;
  return basePrice.mul(new Prisma.Decimal(1).sub(percent.div(100)));
}

export async function getPriceOverrides(
  client: PrismaClientLike,
  priceListId: string | null,
): Promise<{ products: Map<string, Prisma.Decimal>; services: Map<string, Prisma.Decimal> }> {
  const products = new Map<string, Prisma.Decimal>();
  const services = new Map<string, Prisma.Decimal>();
  if (!priceListId) return { products, services };

  const items = await client.priceListItem.findMany({ where: { priceListId } });
  for (const item of items) {
    if (item.productId) products.set(item.productId, item.price);
    if (item.serviceId) services.set(item.serviceId, item.price);
  }
  return { products, services };
}
