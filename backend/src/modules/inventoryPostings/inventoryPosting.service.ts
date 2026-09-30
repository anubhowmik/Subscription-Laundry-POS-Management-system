import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError, NotFoundError, ValidationError } from "../../utils/AppError";
import { parsePagination, parseSort } from "../../utils/pagination";
import { resolveBusinessLocationFilter, assertLocationAllowed } from "../../utils/locationScope";
import { computeShippingStatus } from "../sales/sale.service";

const { Decimal } = Prisma;

const INVENTORY_POSTING_SORTABLE_FIELDS = ["postingDate", "createdAt", "cashInDrawer"];

async function assertLocationInOrg(businessLocationId: string, organizationId: string) {
  const location = await prisma.businessLocation.findFirst({ where: { id: businessLocationId, organizationId } });
  if (!location) throw new NotFoundError("Business location not found");
  return location;
}

const POSTING_INCLUDE = {
  businessLocation: { select: { branchName: true } },
  createdByUser: { select: { fullNameEn: true } },
  sales: {
    select: {
      status: true,
      sale: { select: { id: true, invoiceNumber: true, saleDate: true, totalAmount: true, customer: { select: { nameEn: true, nameAr: true } } } },
    },
  },
} satisfies Prisma.InventoryPostingInclude;

interface ClassifiedSaleRow {
  status: "IN_STOCK" | "OUT_STOCK" | "IN_WAREHOUSE";
  sale: { totalAmount: Prisma.Decimal };
}

function summarizeBuckets(sales: ClassifiedSaleRow[]) {
  const buckets = {
    IN_STOCK: { count: 0, total: new Decimal(0) },
    OUT_STOCK: { count: 0, total: new Decimal(0) },
    IN_WAREHOUSE: { count: 0, total: new Decimal(0) },
  };
  for (const s of sales) {
    const bucket = buckets[s.status];
    bucket.count += 1;
    bucket.total = bucket.total.add(s.sale.totalAmount);
  }
  return {
    inStockCount: buckets.IN_STOCK.count,
    inStockTotal: buckets.IN_STOCK.total.toDecimalPlaces(2),
    outStockCount: buckets.OUT_STOCK.count,
    outStockTotal: buckets.OUT_STOCK.total.toDecimalPlaces(2),
    inWarehouseCount: buckets.IN_WAREHOUSE.count,
    inWarehouseTotal: buckets.IN_WAREHOUSE.total.toDecimalPlaces(2),
  };
}

async function withEmployeeNames<T extends { employeeIds: string[] }>(posting: T, organizationId: string) {
  if (posting.employeeIds.length === 0) return { ...posting, employees: [] };
  const employees = await prisma.user.findMany({ where: { id: { in: posting.employeeIds }, organizationId }, select: { id: true, fullNameEn: true } });
  return { ...posting, employees };
}

/**
 * InventoryPostingController@create's AJAX search - every FINAL sale at this location, in this
 * date range, whose derived shipping status is READY (see sale.service.ts's
 * computeShippingStatus()), and not already classified onto another posting (a sale can only be
 * counted once, ever).
 */
export async function searchReadySales(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const businessLocationId = String(query.businessLocationId ?? "");
  await assertLocationInOrg(businessLocationId, organizationId);
  assertLocationAllowed(businessLocationId, allowedLocationIds);

  const sales = await prisma.sale.findMany({
    where: {
      organizationId,
      businessLocationId,
      status: "FINAL",
      saleDate: { gte: new Date(String(query.from)), lte: new Date(String(query.to)) },
      inventoryPostings: { none: {} },
      ...(query.categoryId ? { items: { some: { product: { categoryId: String(query.categoryId) } } } } : {}),
      ...(query.serviceCategoryId ? { items: { some: { service: { categoryId: String(query.serviceCategoryId) } } } } : {}),
    },
    orderBy: { saleDate: "desc" },
    take: 500,
    include: {
      customer: { select: { nameEn: true, nameAr: true } },
      items: { select: { fulfillmentStatus: true } },
    },
  });

  return sales
    .map((s) => ({ ...s, shippingStatus: computeShippingStatus(s.items), itemCount: s.items.length }))
    .filter((s) => s.shippingStatus === "READY")
    .map(({ items, ...s }) => s);
}

export interface InventoryPostingInput {
  businessLocationId: string;
  cashInDrawer?: number;
  notes?: string;
  employeeIds: string[];
  searchDateFrom: string;
  searchDateTo: string;
  inStockSaleIds: string[];
  outStockSaleIds: string[];
  inWarehouseSaleIds: string[];
}

function classifiedEntries(input: InventoryPostingInput) {
  return [
    ...input.inStockSaleIds.map((saleId) => ({ saleId, status: "IN_STOCK" as const })),
    ...input.outStockSaleIds.map((saleId) => ({ saleId, status: "OUT_STOCK" as const })),
    ...input.inWarehouseSaleIds.map((saleId) => ({ saleId, status: "IN_WAREHOUSE" as const })),
  ];
}

async function validateClassified(
  entries: { saleId: string; status: string }[],
  businessLocationId: string,
  organizationId: string,
  employeeIds: string[],
  excludePostingId?: string,
) {
  if (entries.length === 0) throw new ValidationError([{ field: "inStockSaleIds", message: "At least one sale must be classified" }]);

  const saleIds = entries.map((e) => e.saleId);
  if (new Set(saleIds).size !== saleIds.length) {
    throw new ValidationError([{ field: "inStockSaleIds", message: "A sale cannot be classified into more than one bucket" }]);
  }

  const [sales, employees, alreadyPosted] = await Promise.all([
    prisma.sale.findMany({ where: { id: { in: saleIds }, organizationId, businessLocationId }, select: { id: true } }),
    prisma.user.findMany({ where: { id: { in: employeeIds }, organizationId }, select: { id: true } }),
    prisma.inventoryPostingSale.findMany({
      where: { saleId: { in: saleIds }, ...(excludePostingId ? { inventoryPostingId: { not: excludePostingId } } : {}) },
      select: { saleId: true },
    }),
  ]);

  if (sales.length !== saleIds.length) throw new NotFoundError("One or more sales not found");
  if (employees.length !== employeeIds.length) throw new ValidationError([{ field: "employeeIds", message: "One or more employees not found" }]);
  if (alreadyPosted.length > 0) {
    throw new ValidationError([{ field: "inStockSaleIds", message: "One or more sales are already classified on another posting" }]);
  }
}

export async function create(input: InventoryPostingInput, organizationId: string, createdBy: string, allowedLocationIds: string[] | null) {
  await assertLocationInOrg(input.businessLocationId, organizationId);
  assertLocationAllowed(input.businessLocationId, allowedLocationIds);

  const entries = classifiedEntries(input);
  await validateClassified(entries, input.businessLocationId, organizationId, input.employeeIds);

  const posting = await prisma.$transaction(async (tx) => {
    const created = await tx.inventoryPosting.create({
      data: {
        organizationId,
        businessLocationId: input.businessLocationId,
        cashInDrawer: new Decimal(input.cashInDrawer ?? 0).toDecimalPlaces(2),
        notes: input.notes,
        employeeIds: input.employeeIds,
        searchDateFrom: new Date(input.searchDateFrom),
        searchDateTo: new Date(input.searchDateTo),
        createdBy,
      },
    });
    await tx.inventoryPostingSale.createMany({
      data: entries.map((e) => ({ inventoryPostingId: created.id, saleId: e.saleId, status: e.status })),
    });
    return created;
  });

  return getById(posting.id, organizationId, allowedLocationIds);
}

export async function update(id: string, input: InventoryPostingInput, organizationId: string, allowedLocationIds: string[] | null) {
  const existing = await prisma.inventoryPosting.findFirst({
    where: { id, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
  });
  if (!existing) throw new NotFoundError("Inventory posting not found");
  if (existing.status !== "PENDING") throw new AppError(409, "Only pending postings can be edited");

  await assertLocationInOrg(input.businessLocationId, organizationId);
  assertLocationAllowed(input.businessLocationId, allowedLocationIds);

  const entries = classifiedEntries(input);
  await validateClassified(entries, input.businessLocationId, organizationId, input.employeeIds, id);

  await prisma.$transaction(async (tx) => {
    await tx.inventoryPostingSale.deleteMany({ where: { inventoryPostingId: id } });
    await tx.inventoryPosting.update({
      where: { id },
      data: {
        businessLocationId: input.businessLocationId,
        cashInDrawer: new Decimal(input.cashInDrawer ?? 0).toDecimalPlaces(2),
        notes: input.notes,
        employeeIds: input.employeeIds,
        searchDateFrom: new Date(input.searchDateFrom),
        searchDateTo: new Date(input.searchDateTo),
      },
    });
    await tx.inventoryPostingSale.createMany({
      data: entries.map((e) => ({ inventoryPostingId: id, saleId: e.saleId, status: e.status })),
    });
  });

  return getById(id, organizationId, allowedLocationIds);
}

export async function list(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, INVENTORY_POSTING_SORTABLE_FIELDS, "createdAt");
  const where: Prisma.InventoryPostingWhereInput = {
    organizationId,
    ...resolveBusinessLocationFilter(query.businessLocationId ? String(query.businessLocationId) : undefined, allowedLocationIds),
    ...(query.status ? { status: query.status as "PENDING" | "CONFIRMED" } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.inventoryPosting.findMany({ where, orderBy, skip, take: limit, include: POSTING_INCLUDE }),
    prisma.inventoryPosting.count({ where }),
  ]);

  const data = rows.map(({ sales, ...posting }) => ({ ...posting, ...summarizeBuckets(sales) }));
  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  const posting = await prisma.inventoryPosting.findFirst({
    where: { id, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
    include: POSTING_INCLUDE,
  });
  if (!posting) throw new NotFoundError("Inventory posting not found");
  return withEmployeeNames(posting, organizationId);
}

export async function confirm(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  const existing = await prisma.inventoryPosting.findFirst({
    where: { id, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
  });
  if (!existing) throw new NotFoundError("Inventory posting not found");
  if (existing.status !== "PENDING") throw new AppError(409, "Only pending postings can be confirmed");
  await prisma.inventoryPosting.update({ where: { id }, data: { status: "CONFIRMED" } });
  return getById(id, organizationId, allowedLocationIds);
}

/**
 * InventoryPostingController@reconcile. The reference also writes the OutStock transactions'
 * shipping_status to 'reconcile' - deliberately NOT replicated here, since ItemFulfillmentStatus
 * has no matching state and retrofitting one is a larger, separately-scoped change; this just
 * locks the posting itself as settled.
 */
export async function reconcile(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  const existing = await prisma.inventoryPosting.findFirst({
    where: { id, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
  });
  if (!existing) throw new NotFoundError("Inventory posting not found");
  if (existing.status !== "CONFIRMED") throw new AppError(409, "Only confirmed postings can be reconciled");
  if (existing.reconciledAt) throw new AppError(409, "Posting is already reconciled");
  await prisma.inventoryPosting.update({ where: { id }, data: { reconciledAt: new Date() } });
  return getById(id, organizationId, allowedLocationIds);
}

/**
 * Reference's own "Inventory" (SellController@inventory, shipping_status in ['in_stock',
 * 'in_warehouse']) and "Warehouse Invoices" (SellController@warehouse_invoices,
 * shipping_status='in_warehouse') read-only lists - both are just this same classified-sales view
 * filtered to a different status subset, so one function backs both frontend pages.
 */
export async function listClassifiedSales(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);
  const statuses = (query.status ? String(query.status).split(",") : ["IN_STOCK", "IN_WAREHOUSE"]) as (
    | "IN_STOCK"
    | "OUT_STOCK"
    | "IN_WAREHOUSE"
  )[];

  const where: Prisma.InventoryPostingSaleWhereInput = {
    status: { in: statuses },
    inventoryPosting: {
      organizationId,
      ...resolveBusinessLocationFilter(query.businessLocationId ? String(query.businessLocationId) : undefined, allowedLocationIds),
    },
  };

  const [rows, total] = await Promise.all([
    prisma.inventoryPostingSale.findMany({
      where,
      orderBy: { sale: { saleDate: "desc" } },
      skip,
      take: limit,
      include: {
        sale: { select: { id: true, invoiceNumber: true, saleDate: true, totalAmount: true, customer: { select: { nameEn: true, nameAr: true } } } },
        inventoryPosting: { select: { id: true, postingDate: true, businessLocation: { select: { branchName: true } } } },
      },
    }),
    prisma.inventoryPostingSale.count({ where }),
  ]);

  return { data: rows, meta: { page, limit, total } };
}

export async function remove(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  const existing = await prisma.inventoryPosting.findFirst({
    where: { id, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
  });
  if (!existing) throw new NotFoundError("Inventory posting not found");
  if (existing.status !== "PENDING") throw new AppError(409, "Only pending postings can be deleted");
  await prisma.inventoryPosting.delete({ where: { id } });
}
