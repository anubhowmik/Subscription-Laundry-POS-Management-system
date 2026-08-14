import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError, NotFoundError, ValidationError } from "../../utils/AppError";
import { parsePagination } from "../../utils/pagination";

const { Decimal } = Prisma;

async function generatePurchaseReference(organizationId: string): Promise<string> {
  const count = await prisma.purchase.count({ where: { organizationId } });
  return `PUR-${String(count + 1).padStart(6, "0")}`;
}

interface CreatePurchaseInput {
  supplierId: string;
  businessLocationId: string;
  items: { productId: string; quantity: number; unitCost: number }[];
  paidAmount?: number;
  notes?: string;
}

// Receives stock from a supplier. This is the only place in the app that produces a non-zero
// supplier "Purchase Due" balance - see the schema comment above the Supplier model for why
// there's no separate purchase-order document type.
export async function create(input: CreatePurchaseInput, organizationId: string, createdBy: string) {
  const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, organizationId, deletedAt: null } });
  if (!supplier) throw new NotFoundError("Supplier not found");

  const products = await prisma.product.findMany({
    where: { id: { in: input.items.map((l) => l.productId) }, organizationId },
    include: { tax: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const lines = input.items.map((line) => {
    const product = productMap.get(line.productId);
    if (!product) {
      throw new ValidationError([{ field: "items", message: `Product ${line.productId} not found` }], "Invalid purchase item");
    }
    const quantity = new Decimal(line.quantity);
    const unitCost = new Decimal(line.unitCost);
    const taxPercent = product.tax?.percentage ?? new Decimal(0);
    const subtotal = unitCost.mul(quantity).toDecimalPlaces(2);
    const taxAmount = subtotal.mul(taxPercent).div(100).toDecimalPlaces(2);

    return {
      productId: product.id,
      manageStock: product.manageStock,
      quantity,
      unitCost,
      taxPercent,
      taxAmount,
      subtotal,
      total: subtotal.add(taxAmount),
    };
  });

  const subtotal = lines.reduce((sum, l) => sum.add(l.subtotal), new Decimal(0));
  const taxAmount = lines.reduce((sum, l) => sum.add(l.taxAmount), new Decimal(0));
  const totalAmount = subtotal.add(taxAmount);
  const paidAmount = Decimal.min(new Decimal(input.paidAmount ?? 0), totalAmount);

  return prisma.$transaction(async (tx) => {
    const referenceNumber = await generatePurchaseReference(organizationId);
    const purchase = await tx.purchase.create({
      data: {
        organizationId,
        referenceNumber,
        supplierId: supplier.id,
        businessLocationId: input.businessLocationId,
        subtotal: subtotal.toDecimalPlaces(2),
        taxAmount: taxAmount.toDecimalPlaces(2),
        totalAmount: totalAmount.toDecimalPlaces(2),
        paidAmount: paidAmount.toDecimalPlaces(2),
        notes: input.notes,
        createdBy,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitCost: l.unitCost,
            taxPercent: l.taxPercent,
            taxAmount: l.taxAmount,
            subtotal: l.subtotal,
            total: l.total,
          })),
        },
      },
      include: { items: true },
    });

    for (const line of lines) {
      if (!line.manageStock) continue;
      const stock = await tx.productStock.findUnique({
        where: { productId_businessLocationId: { productId: line.productId, businessLocationId: input.businessLocationId } },
      });
      const newQty = (stock?.quantity ?? new Decimal(0)).add(line.quantity);
      await tx.productStock.upsert({
        where: { productId_businessLocationId: { productId: line.productId, businessLocationId: input.businessLocationId } },
        update: { quantity: newQty },
        create: { productId: line.productId, businessLocationId: input.businessLocationId, quantity: newQty },
      });
      await tx.inventoryTransaction.create({
        data: {
          productId: line.productId,
          businessLocationId: input.businessLocationId,
          type: "STOCK_IN",
          quantity: line.quantity,
          balanceAfter: newQty,
          referenceType: "PURCHASE",
          referenceId: purchase.id,
          createdBy,
        },
      });
    }

    // What we owe the supplier goes up by the full invoice value, then back down by whatever was
    // paid immediately - the same net-effect pattern as SellReturn's customer balance update.
    const netBalanceChange = totalAmount.sub(paidAmount);
    await tx.supplier.update({ where: { id: supplier.id }, data: { balance: { increment: netBalanceChange.toDecimalPlaces(2) } } });

    return purchase;
  });
}

export async function list(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);
  const where: Prisma.PurchaseWhereInput = {
    organizationId,
    ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}),
    ...(query.businessLocationId ? { businessLocationId: String(query.businessLocationId) } : {}),
    ...(query.supplierId ? { supplierId: String(query.supplierId) } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        supplier: { select: { nameEn: true, nameAr: true } },
        businessLocation: { select: { branchName: true } },
        createdByUser: { select: { fullNameEn: true } },
        items: { include: { product: { select: { nameEn: true, nameAr: true } } } },
      },
    }),
    prisma.purchase.count({ where }),
  ]);

  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  const purchase = await prisma.purchase.findFirst({
    where: { id, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
    include: {
      supplier: { select: { nameEn: true, nameAr: true } },
      items: { include: { product: { select: { nameEn: true, nameAr: true } } } },
    },
  });
  if (!purchase) throw new NotFoundError("Purchase not found");
  return purchase;
}

/** The purchase plus, for each of its items, how much has already been returned and how much is still returnable. */
export async function getReturnablePurchase(purchaseId: string, organizationId: string, allowedLocationIds: string[] | null) {
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
    include: { items: { include: { product: { select: { nameEn: true, nameAr: true } } } }, supplier: { select: { nameEn: true, nameAr: true } } },
  });
  if (!purchase) throw new NotFoundError("Purchase not found");

  const returnedRows = await prisma.purchaseReturnItem.groupBy({
    by: ["purchaseItemId"],
    where: { purchaseItemId: { in: purchase.items.map((i) => i.id) } },
    _sum: { quantity: true },
  });
  const returnedByItem = new Map(returnedRows.map((r) => [r.purchaseItemId, r._sum.quantity ?? new Decimal(0)]));

  return {
    id: purchase.id,
    referenceNumber: purchase.referenceNumber,
    supplier: purchase.supplier,
    items: purchase.items.map((item) => {
      const alreadyReturned = returnedByItem.get(item.id) ?? new Decimal(0);
      return {
        id: item.id,
        productNameEn: item.product.nameEn,
        productNameAr: item.product.nameAr,
        quantity: item.quantity,
        unitCost: item.unitCost,
        alreadyReturned,
        remaining: item.quantity.sub(alreadyReturned),
      };
    }),
  };
}

interface CreatePurchaseReturnInput {
  purchaseId: string;
  items: { purchaseItemId: string; quantity: number; reason: "DEFECTIVE" | "WRONG_ITEM" | "OVERSTOCK" | "OTHER"; note?: string }[];
  refundedAmount?: number;
  notes?: string;
}

export async function createReturn(input: CreatePurchaseReturnInput, organizationId: string, createdBy: string) {
  const purchase = await prisma.purchase.findFirst({ where: { id: input.purchaseId, organizationId }, include: { items: true } });
  if (!purchase) throw new NotFoundError("Purchase not found");

  const itemMap = new Map(purchase.items.map((i) => [i.id, i]));
  for (const line of input.items) {
    if (!itemMap.has(line.purchaseItemId)) {
      throw new ValidationError([{ field: "items", message: `Item ${line.purchaseItemId} does not belong to this purchase` }], "Invalid return item");
    }
  }

  const returnedRows = await prisma.purchaseReturnItem.groupBy({
    by: ["purchaseItemId"],
    where: { purchaseItemId: { in: input.items.map((l) => l.purchaseItemId) } },
    _sum: { quantity: true },
  });
  const alreadyReturned = new Map(returnedRows.map((r) => [r.purchaseItemId, r._sum.quantity ?? new Decimal(0)]));

  const lines = input.items.map((line) => {
    const original = itemMap.get(line.purchaseItemId)!;
    const already = alreadyReturned.get(line.purchaseItemId) ?? new Decimal(0);
    const remaining = original.quantity.sub(already);
    const quantity = new Decimal(line.quantity);
    if (quantity.gt(remaining)) {
      throw new AppError(400, `Cannot return ${quantity} - only ${remaining} remaining`);
    }

    const unitCost = original.unitCost;
    const taxPercent = original.taxPercent;
    const subtotal = unitCost.mul(quantity).toDecimalPlaces(2);
    const taxAmount = subtotal.mul(taxPercent).div(100).toDecimalPlaces(2);

    return {
      purchaseItemId: line.purchaseItemId,
      productId: original.productId,
      quantity,
      unitCost,
      taxPercent,
      taxAmount,
      subtotal,
      total: subtotal.add(taxAmount),
      reason: line.reason,
      note: line.note,
    };
  });

  const subtotal = lines.reduce((sum, l) => sum.add(l.subtotal), new Decimal(0));
  const taxAmount = lines.reduce((sum, l) => sum.add(l.taxAmount), new Decimal(0));
  const totalAmount = subtotal.add(taxAmount);
  const refundedAmount = Decimal.min(new Decimal(input.refundedAmount ?? 0), totalAmount);

  return prisma.$transaction(async (tx) => {
    const purchaseReturn = await tx.purchaseReturn.create({
      data: {
        organizationId,
        purchaseId: purchase.id,
        supplierId: purchase.supplierId,
        businessLocationId: purchase.businessLocationId,
        subtotal: subtotal.toDecimalPlaces(2),
        taxAmount: taxAmount.toDecimalPlaces(2),
        totalAmount: totalAmount.toDecimalPlaces(2),
        refundedAmount: refundedAmount.toDecimalPlaces(2),
        notes: input.notes,
        createdBy,
        items: {
          create: lines.map((l) => ({
            purchaseItemId: l.purchaseItemId,
            quantity: l.quantity,
            unitCost: l.unitCost,
            taxPercent: l.taxPercent,
            taxAmount: l.taxAmount,
            subtotal: l.subtotal,
            total: l.total,
            reason: l.reason,
            note: l.note,
          })),
        },
      },
      include: { items: true },
    });

    for (const line of lines) {
      const product = await tx.product.findUnique({ where: { id: line.productId }, select: { manageStock: true } });
      if (!product?.manageStock) continue;

      const stock = await tx.productStock.findUnique({
        where: { productId_businessLocationId: { productId: line.productId, businessLocationId: purchase.businessLocationId } },
      });
      const newQty = (stock?.quantity ?? new Decimal(0)).sub(line.quantity);
      await tx.productStock.upsert({
        where: { productId_businessLocationId: { productId: line.productId, businessLocationId: purchase.businessLocationId } },
        update: { quantity: newQty },
        create: { productId: line.productId, businessLocationId: purchase.businessLocationId, quantity: newQty },
      });
      await tx.inventoryTransaction.create({
        data: {
          productId: line.productId,
          businessLocationId: purchase.businessLocationId,
          type: "STOCK_OUT",
          quantity: line.quantity.neg(),
          balanceAfter: newQty,
          referenceType: "PURCHASE_RETURN",
          referenceId: purchaseReturn.id,
          createdBy,
        },
      });
    }

    // Net effect: the returned value reduces what we owe the supplier; any cash the supplier
    // actually hands back on top of that further reduces our balance. If nothing is refunded in
    // cash, the return still nets fully against the outstanding Purchase Due.
    const netBalanceChange = totalAmount.sub(refundedAmount);
    await tx.supplier.update({ where: { id: purchase.supplierId }, data: { balance: { decrement: netBalanceChange.toDecimalPlaces(2) } } });

    return purchaseReturn;
  });
}

export async function listReturns(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);
  const where: Prisma.PurchaseReturnWhereInput = {
    organizationId,
    ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}),
    ...(query.businessLocationId ? { businessLocationId: String(query.businessLocationId) } : {}),
    ...(query.supplierId ? { supplierId: String(query.supplierId) } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.purchaseReturn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        purchase: { select: { referenceNumber: true } },
        supplier: { select: { nameEn: true, nameAr: true } },
        businessLocation: { select: { branchName: true } },
        createdByUser: { select: { fullNameEn: true } },
        items: { include: { purchaseItem: { include: { product: { select: { nameEn: true, nameAr: true } } } } } },
      },
    }),
    prisma.purchaseReturn.count({ where }),
  ]);

  return { data, meta: { page, limit, total } };
}
