import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { NotFoundError } from "../../utils/AppError";
import { resolveBusinessLocationFilter } from "../../utils/locationScope";
import { renderQrPngDataUrl } from "../zatca/qrCode.service";
import { sendTemplatedSms } from "../notifications/notifications.service";

const SORTABLE_FIELDS = ["saleDate", "totalAmount", "invoiceNumber", "createdAt"];

export async function list(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "saleDate");

  const where: Prisma.SaleWhereInput = {
    organizationId,
    ...resolveBusinessLocationFilter(query.businessLocationId ? String(query.businessLocationId) : undefined, allowedLocationIds),
    ...(query.customerId ? { customerId: String(query.customerId) } : {}),
    // Defaults to FINAL only - DRAFT quotes live on the Quotes page (see pos.service.ts
    // listQuotes) and CANCELLED/voided quotes shouldn't clutter the invoice list either.
    status: query.status ? (query.status as "DRAFT" | "FINAL" | "CANCELLED") : "FINAL",
    ...(query.paymentStatus ? { paymentStatus: query.paymentStatus as "PAID" | "PARTIAL" | "DUE" | "OVERPAID" } : {}),
    ...(query.from || query.to
      ? {
          saleDate: {
            ...(query.from ? { gte: new Date(String(query.from)) } : {}),
            ...(query.to ? { lte: new Date(String(query.to)) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { invoiceNumber: { contains: String(query.search), mode: "insensitive" } },
            { customer: { nameEn: { contains: String(query.search), mode: "insensitive" } } },
            { customer: { phone: { contains: String(query.search) } } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: { customer: true, businessLocation: true, createdByUser: { select: { fullNameEn: true } }, items: true },
    }),
    prisma.sale.count({ where }),
  ]);
  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  const sale = await prisma.sale.findFirst({
    where: { id, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
    include: {
      customer: true,
      businessLocation: { include: { invoiceLayoutSettings: true } },
      createdByUser: { select: { fullNameEn: true } },
      items: { include: { product: true, service: true } },
      payments: { include: { paymentMethod: true } },
      registerSession: { select: { openedAt: true, openedByUser: { select: { fullNameEn: true } } } },
    },
  });
  if (!sale) throw new NotFoundError("Sale not found");
  return sale;
}

export async function getQrImage(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  const sale = await prisma.sale.findFirst({
    where: { id, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
    select: { qrCodeBase64: true },
  });
  if (!sale) throw new NotFoundError("Sale not found");
  const qrImageDataUrl = await renderQrPngDataUrl(sale.qrCodeBase64 ?? "");
  return { qrCodeBase64: sale.qrCodeBase64, qrImageDataUrl };
}

type ItemFulfillmentStatus = "PENDING" | "IN_PROGRESS" | "READY" | "DELIVERED" | "CANCELLED";

/**
 * Flat list of sale items for the operational fulfillment board (what's washing, what's ready,
 * what's out for delivery) - a cross-invoice view on top of the per-item status tracking, as
 * opposed to sale.list()'s per-invoice view. Capped at 300 rows since the board is meant for
 * "what needs attention right now", not a historical report.
 */
export async function listBoardItems(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const where: Prisma.SaleItemWhereInput = {
    sale: {
      organizationId,
      // Only FINAL sales are real work-in-progress - a DRAFT quote hasn't been confirmed (or
      // paid, or stocked) yet, and CANCELLED/voided ones are done with.
      status: "FINAL",
      ...resolveBusinessLocationFilter(query.businessLocationId ? String(query.businessLocationId) : undefined, allowedLocationIds),
      ...(query.search
        ? {
            OR: [
              { invoiceNumber: { contains: String(query.search), mode: "insensitive" } },
              { customer: { nameEn: { contains: String(query.search), mode: "insensitive" } } },
              { customer: { phone: { contains: String(query.search) } } },
            ],
          }
        : {}),
    },
    ...(query.status ? { fulfillmentStatus: query.status as ItemFulfillmentStatus } : {}),
  };

  const items = await prisma.saleItem.findMany({
    where,
    orderBy: { sale: { saleDate: "asc" } },
    take: 300,
    include: { sale: { select: { id: true, invoiceNumber: true, saleDate: true, businessLocationId: true, customer: { select: { nameEn: true, nameAr: true, phone: true } } } } },
  });

  // For cancelled items, look up what status they were cancelled FROM (recorded in the audit
  // trail at cancel time), so the board can offer an accurate "restore" rather than guessing or
  // always resetting to Pending. Cancelling has no single natural predecessor - it can happen
  // from Pending, In Progress, or Ready - so this has to come from history, not a fixed map.
  const cancelledIds = items.filter((i) => i.fulfillmentStatus === "CANCELLED").map((i) => i.id);
  const restoreStatusById = new Map<string, ItemFulfillmentStatus>();
  if (cancelledIds.length > 0) {
    const lastCancellations = await prisma.saleItemStatusHistory.findMany({
      where: { saleItemId: { in: cancelledIds }, toStatus: "CANCELLED" },
      orderBy: { changedAt: "desc" },
      distinct: ["saleItemId"],
      select: { saleItemId: true, fromStatus: true },
    });
    for (const row of lastCancellations) {
      if (row.fromStatus) restoreStatusById.set(row.saleItemId, row.fromStatus);
    }
  }

  return items.map((item) => ({
    ...item,
    restoreStatus: item.fulfillmentStatus === "CANCELLED" ? (restoreStatusById.get(item.id) ?? "PENDING") : null,
  }));
}

/**
 * Changes a single line item's fulfillment status (garment tracking), independent of the
 * invoice-level SaleStatus. Verifies the sale belongs to the caller's org/allowed locations
 * before touching anything, and records the change in SaleItemStatusHistory for audit.
 */
export async function updateItemStatus(
  saleId: string,
  itemId: string,
  status: ItemFulfillmentStatus,
  note: string | undefined,
  organizationId: string,
  allowedLocationIds: string[] | null,
  changedBy: string,
) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
    select: { id: true },
  });
  if (!sale) throw new NotFoundError("Sale not found");

  const item = await prisma.saleItem.findFirst({ where: { id: itemId, saleId } });
  if (!item) throw new NotFoundError("Sale item not found");

  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.saleItem.update({ where: { id: itemId }, data: { fulfillmentStatus: status, statusUpdatedAt: now } }),
    prisma.saleItemStatusHistory.create({
      data: { saleItemId: itemId, fromStatus: item.fulfillmentStatus, toStatus: status, changedBy, note },
    }),
  ]);

  // One SMS per order, not per item - fires only once every item on the invoice has reached the
  // same milestone, so a customer with five garments doesn't get five "ready" texts.
  if (status === "READY" || status === "DELIVERED") {
    const siblingItems = await prisma.saleItem.findMany({ where: { saleId }, select: { fulfillmentStatus: true } });
    const allReached = siblingItems.every((i) => i.fulfillmentStatus === status);
    if (allReached) {
      const fullSale = await prisma.sale.findUnique({ where: { id: saleId }, select: { invoiceNumber: true, customer: { select: { phone: true } } } });
      if (fullSale?.customer.phone) {
        await sendTemplatedSms(
          organizationId,
          status === "READY" ? "ORDER_READY" : "ORDER_DELIVERED",
          fullSale.customer.phone,
          { invoiceNumber: fullSale.invoiceNumber ?? "" },
          "SALE",
          saleId,
        );
      }
    }
  }

  return updated;
}
