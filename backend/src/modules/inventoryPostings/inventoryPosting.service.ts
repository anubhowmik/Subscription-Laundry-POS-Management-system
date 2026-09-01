import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/AppError";
import { parsePagination } from "../../utils/pagination";
import { resolveBusinessLocationFilter } from "../../utils/locationScope";

const { Decimal } = Prisma;

// Buckets currently-open sales into In Stock (still being processed) / In Warehouse (ready for
// pickup) the same way the reference site's "Create Inventory Posting" screen does, plus today's
// deliveries as Out Stock. Bounded to the last 30 days so a long-forgotten open order doesn't
// silently sit in In Stock forever and skew every future posting.
export async function computeSnapshot(businessLocationId: string, organizationId: string, postingDate: Date) {
  const since = new Date(postingDate);
  since.setDate(since.getDate() - 30);
  const dayStart = new Date(postingDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(postingDate);
  dayEnd.setHours(23, 59, 59, 999);

  const sales = await prisma.sale.findMany({
    where: { organizationId, businessLocationId, status: "FINAL", createdAt: { gte: since } },
    select: { id: true, totalAmount: true, items: { select: { fulfillmentStatus: true, statusUpdatedAt: true } } },
  });

  let inStockCount = 0;
  let inStockTotal = new Decimal(0);
  let inWarehouseCount = 0;
  let inWarehouseTotal = new Decimal(0);
  let outStockCount = 0;
  let outStockTotal = new Decimal(0);

  for (const sale of sales) {
    const items = sale.items.filter((i) => i.fulfillmentStatus !== "CANCELLED");
    if (items.length === 0) continue;

    const hasPending = items.some((i) => i.fulfillmentStatus === "PENDING" || i.fulfillmentStatus === "IN_PROGRESS");
    const hasReady = items.some((i) => i.fulfillmentStatus === "READY");
    const allDelivered = items.every((i) => i.fulfillmentStatus === "DELIVERED");

    if (hasPending) {
      inStockCount++;
      inStockTotal = inStockTotal.add(sale.totalAmount);
    } else if (hasReady) {
      inWarehouseCount++;
      inWarehouseTotal = inWarehouseTotal.add(sale.totalAmount);
    } else if (allDelivered) {
      const deliveredAt = items.reduce<Date | null>((latest, i) => {
        if (!i.statusUpdatedAt) return latest;
        return !latest || i.statusUpdatedAt > latest ? i.statusUpdatedAt : latest;
      }, null);
      if (deliveredAt && deliveredAt >= dayStart && deliveredAt <= dayEnd) {
        outStockCount++;
        outStockTotal = outStockTotal.add(sale.totalAmount);
      }
    }
  }

  return {
    inStockCount,
    inStockTotal: inStockTotal.toDecimalPlaces(2),
    inWarehouseCount,
    inWarehouseTotal: inWarehouseTotal.toDecimalPlaces(2),
    outStockCount,
    outStockTotal: outStockTotal.toDecimalPlaces(2),
  };
}

interface CreateInventoryPostingInput {
  businessLocationId: string;
  cashInDrawer?: number;
  status?: "PENDING" | "CONFIRMED";
  notes?: string;
}

export async function create(input: CreateInventoryPostingInput, organizationId: string, createdBy: string) {
  const postingDate = new Date();
  const snapshot = await computeSnapshot(input.businessLocationId, organizationId, postingDate);

  return prisma.inventoryPosting.create({
    data: {
      organizationId,
      businessLocationId: input.businessLocationId,
      postingDate,
      status: input.status ?? "PENDING",
      cashInDrawer: new Decimal(input.cashInDrawer ?? 0).toDecimalPlaces(2),
      notes: input.notes,
      createdBy,
      ...snapshot,
    },
  });
}

export async function list(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);
  const where: Prisma.InventoryPostingWhereInput = {
    organizationId,
    ...resolveBusinessLocationFilter(query.businessLocationId ? String(query.businessLocationId) : undefined, allowedLocationIds),
  };

  const [data, total] = await Promise.all([
    prisma.inventoryPosting.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { businessLocation: { select: { branchName: true } }, createdByUser: { select: { fullNameEn: true } } },
    }),
    prisma.inventoryPosting.count({ where }),
  ]);

  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  const posting = await prisma.inventoryPosting.findFirst({
    where: { id, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
    include: { businessLocation: { select: { branchName: true } }, createdByUser: { select: { fullNameEn: true } } },
  });
  if (!posting) throw new NotFoundError("Inventory posting not found");
  return posting;
}

export async function confirm(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  await getById(id, organizationId, allowedLocationIds);
  return prisma.inventoryPosting.update({ where: { id }, data: { status: "CONFIRMED" } });
}
