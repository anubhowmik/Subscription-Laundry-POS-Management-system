import path from "path";
import fs from "fs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { NotFoundError, ValidationError } from "../../utils/AppError";
import { resolveBusinessLocationFilter } from "../../utils/locationScope";
import { renderQrPngDataUrl } from "../zatca/qrCode.service";
import { sendTemplatedSms } from "../notifications/notifications.service";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

const { Decimal } = Prisma;

const SORTABLE_FIELDS = ["saleDate", "totalAmount", "invoiceNumber", "createdAt"];

export async function list(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "saleDate");

  const where: Prisma.SaleWhereInput = {
    organizationId,
    ...resolveBusinessLocationFilter(query.businessLocationId ? String(query.businessLocationId) : undefined, allowedLocationIds),
    ...(query.locationGroupId ? { businessLocation: { groupId: String(query.locationGroupId) } } : {}),
    ...(query.customerId ? { customerId: String(query.customerId) } : {}),
    ...(query.createdBy ? { createdBy: String(query.createdBy) } : {}),
    ...(query.categoryId ? { items: { some: { product: { categoryId: String(query.categoryId) } } } } : {}),
    ...(query.serviceCategoryId ? { items: { some: { service: { categoryId: String(query.serviceCategoryId) } } } } : {}),
    ...(query.productId ? { items: { some: { productId: String(query.productId) } } } : {}),
    ...(query.serviceId ? { items: { some: { serviceId: String(query.serviceId) } } } : {}),
    ...(query.onlyHasReturn === "true" ? { sellReturns: { some: {} } } : {}),
    // "List POS" (SalesPage.tsx's `channel="POS"` prop) scopes this exact same list/query to
    // sales rung up through the touch-grid screen only - reference's own `is_direct_sale`
    // distinction (see schema.prisma's SaleChannel comment). Omitted entirely (as "All Sales"
    // always does) means unfiltered - both channels - matching the reference's own behavior of
    // only adding this WHERE clause for the POS-scoped list, never for the broader one.
    ...(query.channel ? { channel: query.channel as "POS" | "ADD_SALE" } : {}),
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
      include: {
        customer: true,
        businessLocation: { include: { group: { select: { nameEn: true, nameAr: true } } } },
        createdByUser: { select: { fullNameEn: true } },
        items: true,
        // "Payment Method"/"Last Payment Date" columns - the reference derives these from a
        // sale's payment_lines (a single method name if only one was used, else "Multiple"); most
        // recent payment first so the frontend can just read payments[0] for "last payment date".
        payments: { include: { paymentMethod: { select: { nameEn: true, nameAr: true } } }, orderBy: { paymentDate: "desc" } },
        // "Total Return"/"Total After Return" columns - summed client-side from each return's own total.
        sellReturns: { select: { totalAmount: true } },
      },
    }),
    prisma.sale.count({ where }),
  ]);
  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  const sale = await prisma.sale.findFirst({
    where: { id, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
    include: {
      customer: { include: { defaultInvoiceLayout: true } },
      businessLocation: { include: { invoiceLayoutSettings: true } },
      createdByUser: { select: { fullNameEn: true } },
      items: { include: { product: true, service: true } },
      payments: { include: { paymentMethod: true } },
      registerSession: { select: { openedAt: true, openedByUser: { select: { fullNameEn: true } } } },
    },
  });
  if (!sale) throw new NotFoundError("Sale not found");
  // Resolution priority: the customer's own assigned layout (reference's "Invoice Layout for
  // Sale" contact field) -> the branch's default layout -> null (frontend renders "standard").
  // InvoicePage.tsx reads `resolvedInvoiceLayout`, not the raw nested relations, so this is the
  // only place this priority is decided.
  const resolvedInvoiceLayout =
    sale.customer?.defaultInvoiceLayout ?? sale.businessLocation.invoiceLayoutSettings.find((l) => l.isDefault) ?? null;
  return { ...sale, resolvedInvoiceLayout };
}

// Streams back Add Sale's attached document (see sale.controller.ts's uploadDocument/
// downloadDocument and pos.service.ts checkout()'s documentPath handling). Never trusts
// documentPath alone for org-scoping - re-verifies the Sale itself belongs to this
// organization/location scope first, exactly like every other single-sale lookup here, then
// resolves the path against the fixed uploads root so a crafted documentPath could never escape
// it (path.join + a startsWith check on the resolved absolute path).
export async function getDocumentPath(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  const sale = await prisma.sale.findFirst({
    where: { id, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
    select: { documentPath: true, documentOriginalName: true },
  });
  if (!sale) throw new NotFoundError("Sale not found");
  if (!sale.documentPath) throw new NotFoundError("This sale has no attached document");

  const absolutePath = path.join(UPLOAD_ROOT, sale.documentPath);
  if (!absolutePath.startsWith(UPLOAD_ROOT) || !fs.existsSync(absolutePath)) {
    throw new NotFoundError("This sale has no attached document");
  }
  return { absolutePath, downloadName: sale.documentOriginalName ?? "document" };
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

const SHIPPING_STAGE_RANK: Record<ItemFulfillmentStatus, number> = {
  PENDING: 0,
  IN_PROGRESS: 1,
  READY: 2,
  DELIVERED: 3,
  CANCELLED: 4,
};

/** A sale's overall shipping status, derived from its items' fulfillmentStatus rather than a
 * separate stored column - reference's own `shipping_status` is a single whole-transaction value
 * (a distinct, much larger enum: ordered/under_cleaning/cleaned/ready/delivered/cancelled/
 * delay_to_deliver/reconcile/request_to_warehouse/in_warehouse/sent_to_charity), but this app
 * already tracks the equivalent pipeline per line item (see updateItemStatus above /
 * listBoardItems), so introducing a second, independently-editable whole-sale status would just
 * create two sources of truth that could drift apart. Instead: the sale isn't further along than
 * its least-progressed item (CANCELLED items don't count unless every item is cancelled) - the
 * same "what's holding this order up" logic a cashier would apply by eye. */
function computeShippingStatus(items: { fulfillmentStatus: ItemFulfillmentStatus }[]): ItemFulfillmentStatus {
  const active = items.filter((i) => i.fulfillmentStatus !== "CANCELLED");
  if (active.length === 0) return "CANCELLED";
  return active.reduce((worst, i) => (SHIPPING_STAGE_RANK[i.fulfillmentStatus] < SHIPPING_STAGE_RANK[worst] ? i.fulfillmentStatus : worst), active[0].fulfillmentStatus);
}

/**
 * Reference's own "Shipments" list (SellController@shipments + the `only_shipments` DataTable
 * filter) - every FINAL sale, filterable by its (derived) shipping status alongside the usual
 * location/customer/date/user/payment-status filters. Since shippingStatus isn't a real column,
 * it can't be pushed into the SQL WHERE clause - filtering/pagination on it happens in JS after a
 * capped fetch, the same pragmatic tradeoff listBoardItems above already makes for a
 * cross-invoice operational view rather than a historical report over a huge date range.
 */
export async function listShipments(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);

  const where: Prisma.SaleWhereInput = {
    organizationId,
    status: "FINAL",
    ...resolveBusinessLocationFilter(query.businessLocationId ? String(query.businessLocationId) : undefined, allowedLocationIds),
    ...(query.customerId ? { customerId: String(query.customerId) } : {}),
    ...(query.createdBy ? { createdBy: String(query.createdBy) } : {}),
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

  const rows = await prisma.sale.findMany({
    where,
    orderBy: { saleDate: "desc" },
    take: 2000,
    include: {
      customer: { select: { nameEn: true, nameAr: true, phone: true } },
      businessLocation: { select: { branchName: true } },
      items: { select: { fulfillmentStatus: true } },
    },
  });

  const withStatus = rows.map((r) => ({ ...r, shippingStatus: computeShippingStatus(r.items) }));
  const filtered = query.shippingStatus ? withStatus.filter((r) => r.shippingStatus === query.shippingStatus) : withStatus;

  return { data: filtered.slice(skip, skip + limit), meta: { page, limit, total: filtered.length } };
}

export interface PayDueInput {
  paymentMethodId: string;
  amount: number;
  referenceNumber?: string;
  notes?: string;
}

/**
 * Records a payment against ONE due/partial sale - the reference's own "Add Payment" row action
 * (`TransactionPaymentController::addPayment()`), converted per-sale rather than the group-level
 * lump-sum version Round 21 built for Customer Groups. Deliberately additive-only: it creates a
 * new `Payment` row and recomputes `paidAmount`/`dueAmount`/`paymentStatus`, never touches the
 * sale's already-hash-chained ZATCA fields (icv/invoiceHash/xmlContent/...), so it carries none of
 * the invoice-integrity risk a real "edit" or "delete" of a FINAL sale would (see this round's
 * memory note on why Cancel/Delete Sale was deliberately NOT built alongside this).
 */
export async function payDue(id: string, input: PayDueInput, organizationId: string, allowedLocationIds: string[] | null, userId: string) {
  const sale = await prisma.sale.findFirst({
    where: { id, organizationId, status: "FINAL", ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
  });
  if (!sale) throw new NotFoundError("Sale not found");

  const amount = new Decimal(input.amount);
  if (amount.gt(sale.dueAmount)) {
    throw new ValidationError([{ field: "amount", message: `Amount cannot exceed this sale's due of ${sale.dueAmount.toFixed(2)}` }]);
  }

  return prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        saleId: sale.id,
        customerId: sale.customerId,
        businessLocationId: sale.businessLocationId,
        amount,
        paymentMethodId: input.paymentMethodId,
        type: "SALE_PAYMENT",
        referenceNumber: input.referenceNumber,
        notes: input.notes,
        createdBy: userId,
      },
    });

    const newPaidAmount = sale.paidAmount.add(amount);
    const newDueAmount = sale.totalAmount.sub(newPaidAmount);
    let paymentStatus: "PAID" | "PARTIAL" | "DUE" | "OVERPAID";
    if (newPaidAmount.eq(0)) paymentStatus = "DUE";
    else if (newPaidAmount.gt(sale.totalAmount)) paymentStatus = "OVERPAID";
    else if (newPaidAmount.eq(sale.totalAmount)) paymentStatus = "PAID";
    else paymentStatus = "PARTIAL";

    return tx.sale.update({
      where: { id: sale.id },
      data: { paidAmount: newPaidAmount, dueAmount: newDueAmount, paymentStatus },
      include: { payments: { include: { paymentMethod: true } } },
    });
  });
}
