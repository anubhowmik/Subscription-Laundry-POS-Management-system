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
    select: { priceListId: true, customerGroup: { select: { priceListId: true } } },
  });
  if (!customer) return locationFallback;
  return customer.priceListId ?? customer.customerGroup?.priceListId ?? locationFallback;
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
