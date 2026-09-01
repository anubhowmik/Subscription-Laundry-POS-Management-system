import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError, NotFoundError } from "../../utils/AppError";
import { parsePagination, parseSort } from "../../utils/pagination";
import { claimBusinessLocationNumber } from "../../utils/documentNumbering";
import { assertLocationAllowed, resolveBusinessLocationFilter } from "../../utils/locationScope";

const { Decimal } = Prisma;

async function assertLocationInOrg(businessLocationId: string, organizationId: string) {
  const location = await prisma.businessLocation.findFirst({ where: { id: businessLocationId, organizationId } });
  if (!location) throw new NotFoundError("Business location not found");
  return location;
}

interface AdjustStockInput {
  productId: string;
  businessLocationId: string;
  quantityChange: number;
  reason: string;
}

export async function adjustStock(
  input: AdjustStockInput,
  organizationId: string,
  createdBy: string,
  allowedLocationIds: string[] | null,
) {
  const product = await prisma.product.findFirst({ where: { id: input.productId, organizationId, deletedAt: null } });
  if (!product) throw new NotFoundError("Product not found");
  await assertLocationInOrg(input.businessLocationId, organizationId);
  assertLocationAllowed(input.businessLocationId, allowedLocationIds);

  const change = new Decimal(input.quantityChange);

  return prisma.$transaction(async (tx) => {
    const stock = await tx.productStock.findUnique({
      where: { productId_businessLocationId: { productId: input.productId, businessLocationId: input.businessLocationId } },
    });
    const currentQty = stock?.quantity ?? new Decimal(0);
    const newQty = currentQty.add(change);
    if (newQty.lt(0)) {
      throw new AppError(400, `Adjustment would make stock negative (current: ${currentQty}, change: ${change})`);
    }

    await tx.productStock.upsert({
      where: { productId_businessLocationId: { productId: input.productId, businessLocationId: input.businessLocationId } },
      update: { quantity: newQty },
      create: { productId: input.productId, businessLocationId: input.businessLocationId, quantity: newQty },
    });

    return tx.inventoryTransaction.create({
      data: {
        productId: input.productId,
        businessLocationId: input.businessLocationId,
        type: "ADJUSTMENT",
        quantity: change,
        balanceAfter: newQty,
        referenceType: "ADJUSTMENT",
        note: input.reason,
        createdBy,
      },
    });
  });
}

interface ShipTransferInput {
  productId: string;
  fromBusinessLocationId: string;
  toBusinessLocationId: string;
  quantity: number;
  driverName?: string;
  vehicleNumber?: string;
  shipNote?: string;
}

const TRANSFER_INCLUDE = {
  product: { select: { nameEn: true, nameAr: true, sku: true } },
  fromBusinessLocation: { select: { branchName: true } },
  toBusinessLocation: { select: { branchName: true } },
  createdByUser: { select: { fullNameEn: true } },
  receivedByUser: { select: { fullNameEn: true } },
} satisfies Prisma.StockTransferInclude;

/** Step 1 of the two-step transfer: decrements the source immediately and creates an IN_TRANSIT
 * StockTransfer row. Destination stock is untouched until receiveTransfer() confirms it.
 * `allowedFromLocationIds` is null for an unrestricted actor (isSystemAdmin, or zero restriction
 * rows) - P8-5d. */
export async function shipTransfer(
  input: ShipTransferInput,
  organizationId: string,
  createdBy: string,
  allowedFromLocationIds: string[] | null = null,
) {
  const product = await prisma.product.findFirst({ where: { id: input.productId, organizationId, deletedAt: null } });
  if (!product) throw new NotFoundError("Product not found");
  await assertLocationInOrg(input.fromBusinessLocationId, organizationId);
  await assertLocationInOrg(input.toBusinessLocationId, organizationId);
  if (allowedFromLocationIds && !allowedFromLocationIds.includes(input.fromBusinessLocationId)) {
    throw new AppError(403, "You are not allowed to transfer stock out of this location");
  }

  const quantity = new Decimal(input.quantity);
  const transferRef = randomUUID();

  const transferId = await prisma.$transaction(async (tx) => {
    const fromStock = await tx.productStock.findUnique({
      where: { productId_businessLocationId: { productId: input.productId, businessLocationId: input.fromBusinessLocationId } },
    });
    const fromQty = fromStock?.quantity ?? new Decimal(0);
    const newFromQty = fromQty.sub(quantity);
    if (newFromQty.lt(0)) {
      throw new AppError(400, `Insufficient stock at source location (available: ${fromQty}, requested: ${quantity})`);
    }

    await tx.productStock.upsert({
      where: { productId_businessLocationId: { productId: input.productId, businessLocationId: input.fromBusinessLocationId } },
      update: { quantity: newFromQty },
      create: { productId: input.productId, businessLocationId: input.fromBusinessLocationId, quantity: newFromQty },
    });

    await tx.inventoryTransaction.create({
      data: {
        productId: input.productId,
        businessLocationId: input.fromBusinessLocationId,
        type: "TRANSFER_OUT",
        quantity: quantity.neg(),
        balanceAfter: newFromQty,
        referenceType: "TRANSFER",
        referenceId: transferRef,
        note: input.shipNote,
        createdBy,
      },
    });

    const transfer = await tx.stockTransfer.create({
      data: {
        organizationId,
        productId: input.productId,
        fromBusinessLocationId: input.fromBusinessLocationId,
        toBusinessLocationId: input.toBusinessLocationId,
        quantitySent: quantity,
        driverName: input.driverName,
        vehicleNumber: input.vehicleNumber,
        shipNote: input.shipNote,
        createdBy,
      },
    });

    return transfer.id;
  });

  return prisma.stockTransfer.findUniqueOrThrow({ where: { id: transferId }, include: TRANSFER_INCLUDE });
}

/** Step 2: confirms receipt, crediting the destination with the actual quantity received (which
 * may differ from what was shipped, surfacing a discrepancy). */
export async function receiveTransfer(
  id: string,
  input: { quantityReceived?: number; receiveNote?: string },
  organizationId: string,
  receivedBy: string,
) {
  const existing = await prisma.stockTransfer.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Stock transfer not found");
  if (existing.status !== "IN_TRANSIT") throw new AppError(409, "Transfer is not in transit");

  const quantityReceived = input.quantityReceived != null ? new Decimal(input.quantityReceived) : existing.quantitySent;

  await prisma.$transaction(async (tx) => {
    const toStock = await tx.productStock.findUnique({
      where: { productId_businessLocationId: { productId: existing.productId, businessLocationId: existing.toBusinessLocationId } },
    });
    const newToQty = (toStock?.quantity ?? new Decimal(0)).add(quantityReceived);

    await tx.productStock.upsert({
      where: { productId_businessLocationId: { productId: existing.productId, businessLocationId: existing.toBusinessLocationId } },
      update: { quantity: newToQty },
      create: { productId: existing.productId, businessLocationId: existing.toBusinessLocationId, quantity: newToQty },
    });

    await tx.inventoryTransaction.create({
      data: {
        productId: existing.productId,
        businessLocationId: existing.toBusinessLocationId,
        type: "TRANSFER_IN",
        quantity: quantityReceived,
        balanceAfter: newToQty,
        referenceType: "TRANSFER",
        referenceId: existing.id,
        note: input.receiveNote,
        createdBy: receivedBy,
      },
    });

    await tx.stockTransfer.update({
      where: { id: existing.id },
      data: {
        status: "RECEIVED",
        quantityReceived,
        receiveNote: input.receiveNote,
        receivedAt: new Date(),
        receivedBy,
      },
    });
  });

  return prisma.stockTransfer.findUniqueOrThrow({ where: { id: existing.id }, include: TRANSFER_INCLUDE });
}

/** Cancels an in-transit transfer, restoring the source location's stock. */
export async function cancelTransfer(id: string, organizationId: string) {
  const existing = await prisma.stockTransfer.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Stock transfer not found");
  if (existing.status !== "IN_TRANSIT") throw new AppError(409, "Transfer is not in transit");

  await prisma.$transaction(async (tx) => {
    const fromStock = await tx.productStock.findUnique({
      where: { productId_businessLocationId: { productId: existing.productId, businessLocationId: existing.fromBusinessLocationId } },
    });
    const restoredQty = (fromStock?.quantity ?? new Decimal(0)).add(existing.quantitySent);

    await tx.productStock.upsert({
      where: { productId_businessLocationId: { productId: existing.productId, businessLocationId: existing.fromBusinessLocationId } },
      update: { quantity: restoredQty },
      create: { productId: existing.productId, businessLocationId: existing.fromBusinessLocationId, quantity: restoredQty },
    });

    await tx.inventoryTransaction.create({
      data: {
        productId: existing.productId,
        businessLocationId: existing.fromBusinessLocationId,
        type: "TRANSFER_IN",
        quantity: existing.quantitySent,
        balanceAfter: restoredQty,
        referenceType: "TRANSFER_CANCEL",
        referenceId: existing.id,
        note: "Transfer cancelled",
        createdBy: existing.createdBy,
      },
    });

    await tx.stockTransfer.update({ where: { id: existing.id }, data: { status: "CANCELLED" } });
  });

  return prisma.stockTransfer.findUniqueOrThrow({ where: { id: existing.id }, include: TRANSFER_INCLUDE });
}

export async function listTransfers(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);

  const where: Prisma.StockTransferWhereInput = {
    organizationId,
    ...(allowedLocationIds
      ? { OR: [{ fromBusinessLocationId: { in: allowedLocationIds } }, { toBusinessLocationId: { in: allowedLocationIds } }] }
      : {}),
    ...(query.status ? { status: query.status as "IN_TRANSIT" | "RECEIVED" | "CANCELLED" } : {}),
    ...(query.productId ? { productId: String(query.productId) } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.stockTransfer.findMany({
      where,
      orderBy: { shippedAt: "desc" },
      skip,
      take: limit,
      include: TRANSFER_INCLUDE,
    }),
    prisma.stockTransfer.count({ where }),
  ]);

  return { data, meta: { page, limit, total } };
}

export async function listTransactions(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, ["createdAt"], "createdAt");

  const where: Prisma.InventoryTransactionWhereInput = {
    product: { organizationId },
    ...resolveBusinessLocationFilter(query.businessLocationId ? String(query.businessLocationId) : undefined, allowedLocationIds),
    ...(query.productId ? { productId: String(query.productId) } : {}),
    ...(query.type
      ? { type: query.type as "STOCK_IN" | "STOCK_OUT" | "SALE" | "SALE_RETURN" | "ADJUSTMENT" | "TRANSFER_IN" | "TRANSFER_OUT" }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        product: { select: { nameEn: true, nameAr: true, sku: true } },
        businessLocation: { select: { branchName: true } },
        createdByUser: { select: { fullNameEn: true } },
      },
    }),
    prisma.inventoryTransaction.count({ where }),
  ]);

  return { data, meta: { page, limit, total } };
}

// ---------------------------------------------------------------------------
// Grouped stock adjustments (P8-4) - a batch, multi-product count/write-off with loss
// classification and a reversal path. Distinct from adjustStock() above, which stays available
// for quick single-product corrections and is untouched by any of this.
// ---------------------------------------------------------------------------

interface CreateStockAdjustmentInput {
  businessLocationId: string;
  lossType?: "NORMAL" | "ABNORMAL";
  totalAmountRecovered?: number;
  notes?: string;
  items: { productId: string; quantityChange: number; note?: string }[];
}

const STOCK_ADJUSTMENT_INCLUDE = {
  businessLocation: { select: { branchName: true } },
  createdByUser: { select: { fullNameEn: true } },
  items: { include: { product: { select: { nameEn: true, nameAr: true, sku: true } } } },
} satisfies Prisma.StockAdjustmentInclude;

export async function createStockAdjustment(
  input: CreateStockAdjustmentInput,
  organizationId: string,
  createdBy: string,
  allowedLocationIds: string[] | null,
) {
  await assertLocationInOrg(input.businessLocationId, organizationId);
  assertLocationAllowed(input.businessLocationId, allowedLocationIds);
  if (input.items.length === 0) throw new AppError(400, "At least one item is required");

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds }, organizationId, deletedAt: null } });
  if (products.length !== productIds.length) throw new NotFoundError("One or more products not found");

  const adjustmentId = await prisma.$transaction(async (tx) => {
    const adjustmentNumber = await claimBusinessLocationNumber(tx, input.businessLocationId, "adjustment");

    const adjustment = await tx.stockAdjustment.create({
      data: {
        organizationId,
        businessLocationId: input.businessLocationId,
        adjustmentNumber,
        lossType: input.lossType ?? "NORMAL",
        totalAmountRecovered: input.totalAmountRecovered ?? 0,
        notes: input.notes,
        createdBy,
      },
    });

    for (const item of input.items) {
      const change = new Decimal(item.quantityChange);
      const stock = await tx.productStock.findUnique({
        where: { productId_businessLocationId: { productId: item.productId, businessLocationId: input.businessLocationId } },
      });
      const currentQty = stock?.quantity ?? new Decimal(0);
      const newQty = currentQty.add(change);
      if (newQty.lt(0)) {
        throw new AppError(400, `Adjustment would make stock negative (current: ${currentQty}, change: ${change})`);
      }

      await tx.productStock.upsert({
        where: { productId_businessLocationId: { productId: item.productId, businessLocationId: input.businessLocationId } },
        update: { quantity: newQty },
        create: { productId: item.productId, businessLocationId: input.businessLocationId, quantity: newQty },
      });

      await tx.stockAdjustmentItem.create({
        data: { stockAdjustmentId: adjustment.id, productId: item.productId, quantityChange: change, note: item.note },
      });

      await tx.inventoryTransaction.create({
        data: {
          productId: item.productId,
          businessLocationId: input.businessLocationId,
          type: "ADJUSTMENT",
          quantity: change,
          balanceAfter: newQty,
          referenceType: "STOCK_ADJUSTMENT",
          referenceId: adjustment.id,
          note: item.note ?? input.notes,
          createdBy,
        },
      });
    }

    return adjustment.id;
  });

  return prisma.stockAdjustment.findUniqueOrThrow({ where: { id: adjustmentId }, include: STOCK_ADJUSTMENT_INCLUDE });
}

export async function listStockAdjustments(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);

  const where: Prisma.StockAdjustmentWhereInput = {
    organizationId,
    ...resolveBusinessLocationFilter(query.businessLocationId ? String(query.businessLocationId) : undefined, allowedLocationIds),
    ...(query.status ? { status: query.status as "CONFIRMED" | "REVERSED" } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.stockAdjustment.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit, include: STOCK_ADJUSTMENT_INCLUDE }),
    prisma.stockAdjustment.count({ where }),
  ]);

  return { data, meta: { page, limit, total } };
}

/** Reverses a CONFIRMED adjustment by writing a compensating InventoryTransaction per line with
 * the negated quantityChange - never deletes the original rows, mirrors cancelTransfer()'s
 * "never delete, only compensate" discipline. */
export async function reverseStockAdjustment(id: string, organizationId: string, reversedBy: string) {
  const existing = await prisma.stockAdjustment.findFirst({ where: { id, organizationId }, include: { items: true } });
  if (!existing) throw new NotFoundError("Stock adjustment not found");
  if (existing.status !== "CONFIRMED") throw new AppError(409, "Adjustment is not confirmed");

  await prisma.$transaction(async (tx) => {
    for (const item of existing.items) {
      const negated = item.quantityChange.neg();
      const stock = await tx.productStock.findUnique({
        where: { productId_businessLocationId: { productId: item.productId, businessLocationId: existing.businessLocationId } },
      });
      const currentQty = stock?.quantity ?? new Decimal(0);
      const newQty = currentQty.add(negated);
      if (newQty.lt(0)) {
        throw new AppError(400, "Reversal would make stock negative for one of the products");
      }

      await tx.productStock.upsert({
        where: { productId_businessLocationId: { productId: item.productId, businessLocationId: existing.businessLocationId } },
        update: { quantity: newQty },
        create: { productId: item.productId, businessLocationId: existing.businessLocationId, quantity: newQty },
      });

      await tx.inventoryTransaction.create({
        data: {
          productId: item.productId,
          businessLocationId: existing.businessLocationId,
          type: "ADJUSTMENT",
          quantity: negated,
          balanceAfter: newQty,
          referenceType: "STOCK_ADJUSTMENT_REVERSAL",
          referenceId: existing.id,
          note: "Stock adjustment reversed",
          createdBy: reversedBy,
        },
      });
    }

    await tx.stockAdjustment.update({ where: { id: existing.id }, data: { status: "REVERSED", reversedAt: new Date() } });
  });

  return prisma.stockAdjustment.findUniqueOrThrow({ where: { id: existing.id }, include: STOCK_ADJUSTMENT_INCLUDE });
}
