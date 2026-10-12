import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { itemScopeWhere, productCategoryTree, type ReportAppScope } from "./reportCommon";

const { Decimal } = Prisma;
type Dec = Prisma.Decimal;

/**
 * Shared by the CRM reports that list one row per customer (Customers Revenue, Customers
 * Retention, ...): the reference's Customer / Mobile / Region / Store / Transactions / Units /
 * Basket Size / Sales columns, built from FINAL sale lines. Sales is the reference's
 * quantity x unit_price - the line after its discount, before tax.
 *
 * Store / Region is the branch the customer bought from most (ties: more sales); the reference
 * printed the alphabetically last branch and region (MAX(bl.name)).
 */
export interface CustomerLineFilter {
  organizationId: string;
  locationIds: string[];
  /** Omitted = all time. */
  from?: Date;
  to?: Date;
  scope: ReportAppScope;
  customerId?: string;
  customerIds?: string[];
  customerGroupId?: string;
  promotionId?: string;
  couponId?: string;
  /** Extra customer condition (Consumer Behaviour's "Locations Customers" = no real group). */
  customerWhere?: Prisma.CustomerWhereInput;
}

export async function loadCustomerLines(f: CustomerLineFilter) {
  return prisma.saleItem.findMany({
    where: {
      ...itemScopeWhere(f.scope),
      sale: {
        organizationId: f.organizationId,
        status: "FINAL",
        businessLocationId: { in: f.locationIds },
        ...(f.from || f.to ? { saleDate: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
        ...(f.customerId ? { customerId: f.customerId } : {}),
        ...(f.customerIds ? { customerId: { in: f.customerIds } } : {}),
        // Reference: the customer's own (current) group - c.customer_group_id.
        ...(f.customerGroupId || f.customerWhere ? { customer: { ...(f.customerGroupId ? { customerGroupId: f.customerGroupId } : {}), ...f.customerWhere } } : {}),
        ...(f.promotionId ? { promotionId: f.promotionId } : {}),
        ...(f.couponId ? { couponId: f.couponId } : {}),
      },
    },
    select: {
      saleId: true,
      promotionId: true,
      quantity: true,
      subtotal: true,
      product: { select: { categoryId: true } },
      service: { select: { categoryId: true } },
      sale: {
        select: {
          saleDate: true,
          businessLocationId: true,
          promotionId: true,
          couponId: true,
          customer: { select: { id: true, code: true, nameEn: true, nameAr: true, businessName: true, phone: true, createdAt: true } },
        },
      },
    },
  });
}

export type CustomerLine = Awaited<ReturnType<typeof loadCustomerLines>>[number];

export interface CustomerAcc {
  customer: CustomerLine["sale"]["customer"];
  sales: Set<string>;
  units: Dec;
  amount: Dec;
  byLocation: Map<string, { count: number; amount: Dec }>;
  byCategory: Map<string, { units: Dec; amount: Dec }>;
  /** Sales amount per caller-defined bucket (e.g. retention weeks). */
  buckets: Map<string, Dec>;
}

/** Groups lines per customer; `bucketOf` (optional) files each line's amount under a bucket key. */
export async function accumulateCustomers(organizationId: string, lines: CustomerLine[], bucketOf?: (line: CustomerLine) => string | null) {
  const tree = await productCategoryTree(organizationId);
  const byCustomer = new Map<string, CustomerAcc>();
  for (const line of lines) {
    const c = line.sale.customer;
    const acc =
      byCustomer.get(c.id) ??
      ({ customer: c, sales: new Set(), units: new Decimal(0), amount: new Decimal(0), byLocation: new Map(), byCategory: new Map(), buckets: new Map() } as CustomerAcc);
    const firstLineOfSale = !acc.sales.has(line.saleId);
    acc.sales.add(line.saleId);
    acc.units = acc.units.add(line.quantity);
    acc.amount = acc.amount.add(line.subtotal);
    const loc = acc.byLocation.get(line.sale.businessLocationId) ?? { count: 0, amount: new Decimal(0) };
    if (firstLineOfSale) loc.count++;
    loc.amount = loc.amount.add(line.subtotal);
    acc.byLocation.set(line.sale.businessLocationId, loc);
    const categoryKey = line.product?.categoryId
      ? `pc:${tree.topOf(line.product.categoryId)?.id ?? line.product.categoryId}`
      : line.service?.categoryId
        ? `sc:${line.service.categoryId}`
        : null;
    if (categoryKey) {
      const cat = acc.byCategory.get(categoryKey) ?? { units: new Decimal(0), amount: new Decimal(0) };
      cat.units = cat.units.add(line.quantity);
      cat.amount = cat.amount.add(line.subtotal);
      acc.byCategory.set(categoryKey, cat);
    }
    const bucket = bucketOf?.(line);
    if (bucket) acc.buckets.set(bucket, (acc.buckets.get(bucket) ?? new Decimal(0)).add(line.subtotal));
    byCustomer.set(c.id, acc);
  }
  return { byCustomer, tree };
}

/** Highest weight first, then more sales, then key - used for Store and Best Seller. */
export function topKey<T extends { amount: Dec }>(m: Map<string, T>, weight: (v: T) => Dec | number) {
  return [...m.entries()].sort((a, b) => {
    const wa = weight(a[1]);
    const wb = weight(b[1]);
    const byWeight = typeof wa === "number" ? (wb as number) - wa : (wb as Dec).cmp(wa as Dec);
    return byWeight || b[1].amount.cmp(a[1].amount) || a[0].localeCompare(b[0]);
  })[0]?.[0];
}

export async function branchDirectory(organizationId: string) {
  const branches = await prisma.businessLocation.findMany({
    where: { organizationId },
    select: { id: true, branchName: true, branchNameAr: true, branchCode: true, group: { select: { nameEn: true, nameAr: true } } },
  });
  return new Map(branches.map((b) => [b.id, b]));
}

/** The shared customer columns for one accumulated customer. */
export function customerBaseRow(acc: CustomerAcc, branches: Awaited<ReturnType<typeof branchDirectory>>) {
  const transactions = acc.sales.size;
  const storeId = topKey(acc.byLocation, (v) => v.count);
  const store = storeId ? branches.get(storeId) : undefined;
  return {
    customerId: acc.customer.id,
    customer: acc.customer,
    region: store?.group ?? null,
    store: store ? { branchName: store.branchName, branchNameAr: store.branchNameAr, branchCode: store.branchCode } : null,
    transactions,
    units: acc.units.toDecimalPlaces(3).toString(),
    basketSize: transactions > 0 ? acc.units.div(transactions).toDecimalPlaces(2).toFixed(2) : "0.00",
    sales: acc.amount.toFixed(2),
  };
}

export function customerTotals(rows: { transactions: number; units: string; sales: string }[]) {
  const units = rows.reduce((s, r) => s.add(r.units), new Decimal(0));
  const transactions = rows.reduce((s, r) => s + r.transactions, 0);
  return {
    customers: rows.length,
    transactions,
    units: units.toDecimalPlaces(3).toString(),
    basketSize: transactions > 0 ? units.div(transactions).toDecimalPlaces(2).toFixed(2) : "0.00",
    sales: rows.reduce((s, r) => s.add(r.sales), new Decimal(0)).toFixed(2),
  };
}

/**
 * Best Seller Service: the customer's most-bought category by units (ties: more sales) - main
 * product category or service category. The reference printed the alphabetically last category
 * name (MAX(cat.name)).
 */
export async function bestSellerNamer(organizationId: string, tree: Awaited<ReturnType<typeof productCategoryTree>>) {
  const serviceCategories = await prisma.serviceCategory.findMany({ where: { organizationId }, select: { id: true, nameEn: true, nameAr: true } });
  const byId = new Map(serviceCategories.map((c) => [c.id, c]));
  const nameOf = (key: string) => {
    if (key.startsWith("sc:")) return byId.get(key.slice(3)) ?? null;
    const top = tree.topOf(key.slice(3));
    return top ? { nameEn: top.nameEn, nameAr: top.nameAr } : null;
  };
  return (acc: CustomerAcc) => {
    const key = topKey(acc.byCategory, (v) => v.units);
    return key ? nameOf(key) : null;
  };
}
