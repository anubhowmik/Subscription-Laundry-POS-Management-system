import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError, NotFoundError, ValidationError } from "../../utils/AppError";
import { parsePagination } from "../../utils/pagination";
import { claimBusinessLocationNumber } from "../../utils/documentNumbering";

const { Decimal } = Prisma;

/** The sale plus, for each of its items, how much has already been returned and how much is still returnable. */
export async function getReturnableSale(saleId: string, organizationId: string, allowedLocationIds: string[] | null) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
    include: { items: true, customer: { select: { nameEn: true, nameAr: true } } },
  });
  if (!sale) throw new NotFoundError("Sale not found");

  const returnedRows = await prisma.sellReturnItem.groupBy({
    by: ["saleItemId"],
    where: { saleItemId: { in: sale.items.map((i) => i.id) } },
    _sum: { quantity: true },
  });
  const returnedByItem = new Map(returnedRows.map((r) => [r.saleItemId, r._sum.quantity ?? new Decimal(0)]));

  return {
    id: sale.id,
    invoiceNumber: sale.invoiceNumber,
    customer: sale.customer,
    items: sale.items.map((item) => {
      const alreadyReturned = returnedByItem.get(item.id) ?? new Decimal(0);
      return {
        id: item.id,
        descriptionEn: item.descriptionEn,
        descriptionAr: item.descriptionAr,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        alreadyReturned,
        remaining: item.quantity.sub(alreadyReturned),
      };
    }),
  };
}

interface CreateSellReturnInput {
  saleId: string;
  items: { saleItemId: string; quantity: number; reason: "NOT_WASHABLE" | "DAMAGED" | "NOT_FOUND" | "OTHER"; note?: string }[];
  refundedAmount?: number;
  paymentMethodId?: string;
  notes?: string;
}

export async function create(input: CreateSellReturnInput, organizationId: string, createdBy: string) {
  const sale = await prisma.sale.findFirst({ where: { id: input.saleId, organizationId }, include: { items: true } });
  if (!sale) throw new NotFoundError("Sale not found");

  const saleItemMap = new Map(sale.items.map((i) => [i.id, i]));
  for (const line of input.items) {
    if (!saleItemMap.has(line.saleItemId)) {
      throw new ValidationError([{ field: "items", message: `Item ${line.saleItemId} does not belong to this sale` }], "Invalid return item");
    }
  }

  const returnedRows = await prisma.sellReturnItem.groupBy({
    by: ["saleItemId"],
    where: { saleItemId: { in: input.items.map((l) => l.saleItemId) } },
    _sum: { quantity: true },
  });
  const alreadyReturned = new Map(returnedRows.map((r) => [r.saleItemId, r._sum.quantity ?? new Decimal(0)]));

  const lines = input.items.map((line) => {
    const original = saleItemMap.get(line.saleItemId)!;
    const already = alreadyReturned.get(line.saleItemId) ?? new Decimal(0);
    const remaining = original.quantity.sub(already);
    const quantity = new Decimal(line.quantity);
    if (quantity.gt(remaining)) {
      throw new AppError(400, `Cannot return ${quantity} of "${original.descriptionEn}" - only ${remaining} remaining`);
    }

    const unitPrice = original.unitPrice;
    const taxPercent = original.taxPercent;
    const subtotal = unitPrice.mul(quantity).toDecimalPlaces(2);
    const taxAmount = subtotal.mul(taxPercent).div(100).toDecimalPlaces(2);

    return {
      saleItemId: line.saleItemId,
      productId: original.productId,
      quantity,
      unitPrice,
      taxPercent,
      taxAmount,
      subtotal,
      total: subtotal.add(taxAmount),
      reason: line.reason,
      note: line.note,
      alreadyReturned: already,
      originalQuantity: original.quantity,
      originalFulfillmentStatus: original.fulfillmentStatus,
    };
  });

  const subtotal = lines.reduce((sum, l) => sum.add(l.subtotal), new Decimal(0));
  const taxAmount = lines.reduce((sum, l) => sum.add(l.taxAmount), new Decimal(0));
  const totalAmount = subtotal.add(taxAmount);
  const refundedAmount = Decimal.min(new Decimal(input.refundedAmount ?? 0), totalAmount);

  return prisma.$transaction(async (tx) => {
    const creditNoteNumber = await claimBusinessLocationNumber(tx, sale.businessLocationId, "return");

    const sellReturn = await tx.sellReturn.create({
      data: {
        organizationId,
        saleId: sale.id,
        customerId: sale.customerId,
        businessLocationId: sale.businessLocationId,
        creditNoteNumber,
        subtotal: subtotal.toDecimalPlaces(2),
        taxAmount: taxAmount.toDecimalPlaces(2),
        totalAmount: totalAmount.toDecimalPlaces(2),
        refundedAmount: refundedAmount.toDecimalPlaces(2),
        notes: input.notes,
        createdBy,
        items: {
          create: lines.map((l) => ({
            saleItemId: l.saleItemId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
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

    // Reverse inventory for product lines that track stock, and close out any line that has now
    // been returned in full (partial returns leave the item's fulfillment status untouched).
    for (const line of lines) {
      if (line.productId) {
        const product = await tx.product.findUnique({ where: { id: line.productId }, select: { manageStock: true } });
        if (product?.manageStock) {
          const stock = await tx.productStock.findUnique({
            where: { productId_businessLocationId: { productId: line.productId, businessLocationId: sale.businessLocationId } },
          });
          const newQty = (stock?.quantity ?? new Decimal(0)).add(line.quantity);
          await tx.productStock.upsert({
            where: { productId_businessLocationId: { productId: line.productId, businessLocationId: sale.businessLocationId } },
            update: { quantity: newQty },
            create: { productId: line.productId, businessLocationId: sale.businessLocationId, quantity: newQty },
          });
          await tx.inventoryTransaction.create({
            data: {
              productId: line.productId,
              businessLocationId: sale.businessLocationId,
              type: "SALE_RETURN",
              quantity: line.quantity,
              balanceAfter: newQty,
              referenceType: "SELL_RETURN",
              referenceId: sellReturn.id,
              createdBy,
            },
          });
        }
      }

      const totalReturned = line.alreadyReturned.add(line.quantity);
      if (totalReturned.gte(line.originalQuantity) && line.originalFulfillmentStatus !== "CANCELLED") {
        await tx.saleItem.update({ where: { id: line.saleItemId }, data: { fulfillmentStatus: "CANCELLED", statusUpdatedAt: new Date() } });
        await tx.saleItemStatusHistory.create({
          data: {
            saleItemId: line.saleItemId,
            fromStatus: line.originalFulfillmentStatus,
            toStatus: "CANCELLED",
            changedBy: createdBy,
            note: `Fully returned (return ${sellReturn.id})`,
          },
        });
      }
    }

    // Net balance effect: the invoice value returned reduces what the customer owes; any cash
    // actually handed back on top of that is a separate, offsetting movement. If nothing is
    // refunded in cash, the full amount sits on the account as store credit.
    const netBalanceChange = refundedAmount.sub(totalAmount);
    await tx.customer.update({ where: { id: sale.customerId }, data: { balance: { increment: netBalanceChange.toDecimalPlaces(2) } } });

    if (refundedAmount.gt(0) && input.paymentMethodId) {
      await tx.payment.create({
        data: {
          saleId: sale.id,
          customerId: sale.customerId,
          businessLocationId: sale.businessLocationId,
          amount: refundedAmount.toDecimalPlaces(2),
          paymentMethodId: input.paymentMethodId,
          type: "REFUND",
          referenceNumber: sellReturn.id,
          createdBy,
        },
      });

      const paymentMethod = await tx.paymentMethod.findUnique({ where: { id: input.paymentMethodId }, select: { code: true } });
      if (paymentMethod?.code === "CASH") {
        const openRegisterSession = await tx.registerSession.findFirst({
          where: { businessLocationId: sale.businessLocationId, organizationId, status: "OPEN" },
          select: { id: true },
        });
        if (openRegisterSession) {
          await tx.registerTransaction.create({
            data: {
              registerSessionId: openRegisterSession.id,
              type: "DEBIT",
              amount: refundedAmount.toDecimalPlaces(2),
              paymentMethod: "CASH",
              referenceType: "REFUND",
              referenceId: sellReturn.id,
            },
          });
        }
      }
    }

    return sellReturn;
  });
}

/** Voids a return: reverses stock, reverts any fulfillment-status cancellation it caused, reverses
 * the customer balance adjustment, and removes the refund payment (and its register ledger entry). */
export async function remove(id: string, organizationId: string) {
  const sellReturn = await prisma.sellReturn.findFirst({
    where: { id, organizationId },
    include: { items: { include: { saleItem: true } } },
  });
  if (!sellReturn) throw new NotFoundError("Sell return not found");

  return prisma.$transaction(async (tx) => {
    for (const item of sellReturn.items) {
      if (item.saleItem.productId) {
        const product = await tx.product.findUnique({ where: { id: item.saleItem.productId }, select: { manageStock: true } });
        if (product?.manageStock) {
          const stock = await tx.productStock.findUnique({
            where: { productId_businessLocationId: { productId: item.saleItem.productId, businessLocationId: sellReturn.businessLocationId } },
          });
          const newQty = (stock?.quantity ?? new Decimal(0)).sub(item.quantity);
          await tx.productStock.update({
            where: { productId_businessLocationId: { productId: item.saleItem.productId, businessLocationId: sellReturn.businessLocationId } },
            data: { quantity: newQty },
          });
          await tx.inventoryTransaction.create({
            data: {
              productId: item.saleItem.productId,
              businessLocationId: sellReturn.businessLocationId,
              type: "ADJUSTMENT",
              quantity: item.quantity.neg(),
              balanceAfter: newQty,
              referenceType: "SELL_RETURN_VOID",
              referenceId: sellReturn.id,
              note: `Reversal of voided return ${sellReturn.id}`,
            },
          });
        }
      }

      const cancelHistory = await tx.saleItemStatusHistory.findFirst({
        where: { saleItemId: item.saleItemId, toStatus: "CANCELLED", note: { contains: sellReturn.id } },
        orderBy: { changedAt: "desc" },
      });
      if (cancelHistory) {
        await tx.saleItem.update({
          where: { id: item.saleItemId },
          data: { fulfillmentStatus: cancelHistory.fromStatus ?? "PENDING", statusUpdatedAt: new Date() },
        });
        await tx.saleItemStatusHistory.delete({ where: { id: cancelHistory.id } });
      }
    }

    // Undo the balance netting applied at creation.
    const netBalanceChange = sellReturn.refundedAmount.sub(sellReturn.totalAmount);
    await tx.customer.update({ where: { id: sellReturn.customerId }, data: { balance: { decrement: netBalanceChange } } });

    const refundPayment = await tx.payment.findFirst({ where: { referenceNumber: sellReturn.id, type: "REFUND" } });
    if (refundPayment) {
      const paymentMethod = await tx.paymentMethod.findUnique({ where: { id: refundPayment.paymentMethodId }, select: { code: true } });
      if (paymentMethod?.code === "CASH") {
        await tx.registerTransaction.deleteMany({ where: { referenceType: "REFUND", referenceId: sellReturn.id } });
      }
      await tx.payment.delete({ where: { id: refundPayment.id } });
    }

    await tx.sellReturn.delete({ where: { id: sellReturn.id } });
  });
}

export async function list(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);
  const where: Prisma.SellReturnWhereInput = {
    organizationId,
    ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}),
    ...(query.businessLocationId ? { businessLocationId: String(query.businessLocationId) } : {}),
    ...(query.customerId ? { customerId: String(query.customerId) } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.sellReturn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        sale: { select: { invoiceNumber: true } },
        customer: { select: { nameEn: true, nameAr: true } },
        businessLocation: { select: { branchName: true } },
        createdByUser: { select: { fullNameEn: true } },
        items: { include: { saleItem: { select: { descriptionEn: true, descriptionAr: true } } } },
      },
    }),
    prisma.sellReturn.count({ where }),
  ]);

  return { data, meta: { page, limit, total } };
}
