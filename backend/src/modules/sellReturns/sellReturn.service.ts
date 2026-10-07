import { Prisma, ItemFulfillmentStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError, NotFoundError, ValidationError } from "../../utils/AppError";
import { parsePagination, parseSort } from "../../utils/pagination";
import { claimBusinessLocationNumber } from "../../utils/documentNumbering";
import { finalizeNewPayments } from "../paymentAccounts/paymentAccountLink";

const { Decimal } = Prisma;

type ReturnReason = "NOT_WASHABLE" | "DAMAGED" | "NOT_FOUND";

/** The sale plus, for each of its items, how much has already been returned and how much is still
 * returnable. `excludeSellReturnId` backs the Edit flow (reference's own SellReturnController@add
 * reopening an existing return): that return's own already-counted quantities must not reduce
 * what's available to re-select, or editing would never let you keep (let alone raise) them. */
export async function getReturnableSale(saleId: string, organizationId: string, allowedLocationIds: string[] | null, excludeSellReturnId?: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
    include: { items: true, customer: { select: { nameEn: true, nameAr: true } } },
  });
  if (!sale) throw new NotFoundError("Sale not found");

  const returnedRows = await prisma.sellReturnItem.groupBy({
    by: ["saleItemId"],
    where: { saleItemId: { in: sale.items.map((i) => i.id) }, ...(excludeSellReturnId ? { sellReturnId: { not: excludeSellReturnId } } : {}) },
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
        taxPercent: item.taxPercent,
        alreadyReturned,
        remaining: item.quantity.sub(alreadyReturned),
      };
    }),
  };
}

interface ReturnLineInput {
  saleItemId: string;
  quantity: number;
  reason: ReturnReason;
  note?: string;
}

interface DiscountInput {
  discountMode?: "PERCENT" | "FIXED";
  discountValue?: number;
}

type SaleForPricing = {
  businessLocationId: string;
  items: { id: string; unitPrice: Prisma.Decimal; taxPercent: Prisma.Decimal; quantity: Prisma.Decimal; productId: string | null; fulfillmentStatus: ItemFulfillmentStatus }[];
};

/** Shared by create() and update(): validates requested lines against the sale's items and what's
 * already been returned (already excludes this-same-return for edits - see getReturnableSale's
 * comment), then prices each line and nets the return-level discount into the taxable base the
 * same way Sale's own checkout nets its invoice-level discount (see pos.service.ts's checkout()) -
 * tax is then recomputed per line off its own discounted subtotal (rather than one blended rate)
 * so mixed tax-rate items on the same sale still sum to the right total. */
function priceReturnLines(sale: SaleForPricing, items: ReturnLineInput[], alreadyReturned: Map<string, Prisma.Decimal>, discount: DiscountInput) {
  const saleItemMap = new Map(sale.items.map((i) => [i.id, i]));
  for (const line of items) {
    if (!saleItemMap.has(line.saleItemId)) {
      throw new ValidationError([{ field: "items", message: `Item ${line.saleItemId} does not belong to this sale` }], "Invalid return item");
    }
  }

  const rawLines = items.map((line) => {
    const original = saleItemMap.get(line.saleItemId)!;
    const already = alreadyReturned.get(line.saleItemId) ?? new Decimal(0);
    const remaining = original.quantity.sub(already);
    const quantity = new Decimal(line.quantity);
    if (quantity.gt(remaining)) {
      throw new AppError(400, `Cannot return ${quantity} - only ${remaining} remaining`);
    }

    return {
      saleItemId: line.saleItemId,
      productId: original.productId,
      quantity,
      unitPrice: original.unitPrice,
      taxPercent: original.taxPercent,
      rawSubtotal: original.unitPrice.mul(quantity).toDecimalPlaces(2),
      reason: line.reason,
      note: line.note,
      alreadyReturned: already,
      originalQuantity: original.quantity,
      originalFulfillmentStatus: original.fulfillmentStatus,
    };
  });

  const lineSubtotal = rawLines.reduce((sum, l) => sum.add(l.rawSubtotal), new Decimal(0));

  let discountAmount = new Decimal(0);
  if (discount.discountValue) {
    const raw = discount.discountMode === "PERCENT" ? lineSubtotal.mul(discount.discountValue).div(100) : new Decimal(discount.discountValue);
    discountAmount = Decimal.min(raw, lineSubtotal).toDecimalPlaces(2);
  }
  const discountRatio = lineSubtotal.gt(0) ? lineSubtotal.sub(discountAmount).div(lineSubtotal) : new Decimal(1);

  const lines = rawLines.map((l) => {
    const subtotal = l.rawSubtotal.mul(discountRatio).toDecimalPlaces(2);
    const taxAmount = subtotal.mul(l.taxPercent).div(100).toDecimalPlaces(2);
    return { ...l, subtotal, taxAmount, total: subtotal.add(taxAmount) };
  });

  const subtotal = lines.reduce((sum, l) => sum.add(l.subtotal), new Decimal(0));
  const taxAmount = lines.reduce((sum, l) => sum.add(l.taxAmount), new Decimal(0));
  const totalAmount = subtotal.add(taxAmount);

  return { lines, subtotal, discountAmount, taxAmount, totalAmount };
}

type PricedLine = ReturnType<typeof priceReturnLines>["lines"][number];

/** Reverses the stock/inventory + fulfillment-status side-effects of a return's line items.
 * Shared by remove() (voiding entirely) and update() (about to replace the item set). */
async function reverseItemEffects(
  tx: Prisma.TransactionClient,
  sellReturn: { id: string; businessLocationId: string; items: { saleItemId: string; quantity: Prisma.Decimal; saleItem: { productId: string | null } }[] },
) {
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
            note: `Reversal of return ${sellReturn.id}`,
          },
        });
      }
    }

    const cancelHistory = await tx.saleItemStatusHistory.findFirst({
      where: { saleItemId: item.saleItemId, toStatus: "CANCELLED", note: { contains: sellReturn.id } },
      orderBy: { changedAt: "desc" },
    });
    if (cancelHistory) {
      await tx.saleItem.update({ where: { id: item.saleItemId }, data: { fulfillmentStatus: cancelHistory.fromStatus ?? "PENDING", statusUpdatedAt: new Date() } });
      await tx.saleItemStatusHistory.delete({ where: { id: cancelHistory.id } });
    }
  }
}

/** Applies the stock/inventory + fulfillment-status side-effects for a set of priced return
 * lines. Shared by create() and update() (after that one first reverses the old set above). */
async function applyItemEffects(tx: Prisma.TransactionClient, sale: SaleForPricing, lines: PricedLine[], sellReturnId: string, createdBy: string) {
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
            referenceId: sellReturnId,
            createdBy,
          },
        });
      }
    }

    const totalReturned = line.alreadyReturned.add(line.quantity);
    if (totalReturned.gte(line.originalQuantity) && line.originalFulfillmentStatus !== "CANCELLED") {
      await tx.saleItem.update({ where: { id: line.saleItemId }, data: { fulfillmentStatus: "CANCELLED", statusUpdatedAt: new Date() } });
      await tx.saleItemStatusHistory.create({
        data: { saleItemId: line.saleItemId, fromStatus: line.originalFulfillmentStatus, toStatus: "CANCELLED", changedBy: createdBy, note: `Fully returned (return ${sellReturnId})` },
      });
    }
  }
}

/** Creates the refund Payment row (+ cash-drawer register entry, if the drawer's open and the
 * method is cash) for a given amount. Shared by create()'s initial refund and addPayment()'s
 * later one - reference's own store()/add_payment path does the identical cash-register debit in
 * both places (see SellReturnController's CashRegisterTransaction::create() calls). */
async function createRefundPayment(
  tx: Prisma.TransactionClient,
  sale: { id: string; customerId: string; businessLocationId: string },
  sellReturnId: string,
  amount: Prisma.Decimal,
  paymentMethodId: string,
  createdBy: string,
  organizationId: string,
  notes?: string,
) {
  const refund = await tx.payment.create({
    data: {
      saleId: sale.id,
      customerId: sale.customerId,
      businessLocationId: sale.businessLocationId,
      amount: amount.toDecimalPlaces(2),
      paymentMethodId,
      type: "REFUND",
      referenceNumber: sellReturnId,
      notes,
      createdBy,
    },
  });
  await finalizeNewPayments(tx, [refund.id]);

  const paymentMethod = await tx.paymentMethod.findUnique({ where: { id: paymentMethodId }, select: { code: true } });
  if (paymentMethod?.code === "CASH") {
    const openRegisterSession = await tx.registerSession.findFirst({
      where: { businessLocationId: sale.businessLocationId, organizationId, status: "OPEN" },
      select: { id: true },
    });
    if (openRegisterSession) {
      await tx.registerTransaction.create({
        data: { registerSessionId: openRegisterSession.id, type: "DEBIT", amount: amount.toDecimalPlaces(2), paymentMethod: "CASH", referenceType: "REFUND", referenceId: sellReturnId },
      });
    }
  }
}

interface CreateSellReturnInput extends DiscountInput {
  saleId: string;
  items: ReturnLineInput[];
  refundedAmount?: number;
  paymentMethodId?: string;
  notes?: string;
}

export async function create(input: CreateSellReturnInput, organizationId: string, createdBy: string) {
  const sale = await prisma.sale.findFirst({ where: { id: input.saleId, organizationId }, include: { items: true } });
  if (!sale) throw new NotFoundError("Sale not found");

  const returnedRows = await prisma.sellReturnItem.groupBy({
    by: ["saleItemId"],
    where: { saleItemId: { in: input.items.map((l) => l.saleItemId) } },
    _sum: { quantity: true },
  });
  const alreadyReturned = new Map(returnedRows.map((r) => [r.saleItemId, r._sum.quantity ?? new Decimal(0)]));

  const { lines, subtotal, discountAmount, taxAmount, totalAmount } = priceReturnLines(sale, input.items, alreadyReturned, input);

  const refundedAmount = Decimal.min(new Decimal(input.refundedAmount ?? 0), totalAmount);
  // Reference's own `payment_status` on the sell_return transaction - has the store actually
  // refunded the customer yet, computed the same way Sale.paymentStatus already is elsewhere.
  const paymentStatus = refundedAmount.lte(0) ? "DUE" : refundedAmount.gte(totalAmount) ? "PAID" : "PARTIAL";

  return prisma.$transaction(async (tx) => {
    const creditNoteNumber = await claimBusinessLocationNumber(tx, sale.businessLocationId, "return");

    const sellReturn = await tx.sellReturn.create({
      data: {
        organizationId,
        saleId: sale.id,
        customerId: sale.customerId,
        customerGroupId: sale.customerGroupId,
        businessLocationId: sale.businessLocationId,
        creditNoteNumber,
        subtotal: subtotal.toDecimalPlaces(2),
        discountAmount: discountAmount.toDecimalPlaces(2),
        taxAmount: taxAmount.toDecimalPlaces(2),
        totalAmount: totalAmount.toDecimalPlaces(2),
        refundedAmount: refundedAmount.toDecimalPlaces(2),
        paymentStatus,
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

    await applyItemEffects(tx, sale, lines, sellReturn.id, createdBy);

    // Net balance effect: the invoice value returned reduces what the customer owes; any cash
    // actually handed back on top of that is a separate, offsetting movement. If nothing is
    // refunded in cash, the full amount sits on the account as store credit.
    const netBalanceChange = refundedAmount.sub(totalAmount);
    await tx.customer.update({ where: { id: sale.customerId }, data: { balance: { increment: netBalanceChange.toDecimalPlaces(2) } } });

    if (refundedAmount.gt(0) && input.paymentMethodId) {
      await createRefundPayment(tx, sale, sellReturn.id, refundedAmount, input.paymentMethodId, createdBy, organizationId);
    }

    return sellReturn;
  });
}

interface UpdateSellReturnInput extends DiscountInput {
  items: ReturnLineInput[];
  notes?: string;
}

/** Reference's own "Edit" action (SellReturnController@add reopening an existing return) -
 * changes which items/quantities are being returned (plus the return-level discount/notes), never
 * the refund/payment side - that's the separate addPayment() below, matching how this session
 * already split Sale's own combined reference action into focused pieces. */
export async function update(id: string, input: UpdateSellReturnInput, organizationId: string, allowedLocationIds: string[] | null) {
  const existing = await prisma.sellReturn.findFirst({
    where: { id, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
    include: { items: { include: { saleItem: true } }, sale: { include: { items: true } } },
  });
  if (!existing) throw new NotFoundError("Sell return not found");

  const returnedRows = await prisma.sellReturnItem.groupBy({
    by: ["saleItemId"],
    where: { saleItemId: { in: input.items.map((l) => l.saleItemId) }, sellReturnId: { not: id } },
    _sum: { quantity: true },
  });
  const alreadyReturned = new Map(returnedRows.map((r) => [r.saleItemId, r._sum.quantity ?? new Decimal(0)]));

  const { lines, subtotal, discountAmount, taxAmount, totalAmount } = priceReturnLines(existing.sale, input.items, alreadyReturned, input);

  if (totalAmount.lt(existing.refundedAmount)) {
    throw new AppError(400, `Cannot reduce this return below the ${existing.refundedAmount.toFixed(2)} already refunded - void it instead`);
  }
  const paymentStatus = existing.refundedAmount.lte(0) ? "DUE" : existing.refundedAmount.gte(totalAmount) ? "PAID" : "PARTIAL";

  return prisma.$transaction(async (tx) => {
    await reverseItemEffects(tx, existing);
    await tx.sellReturnItem.deleteMany({ where: { sellReturnId: id } });

    await tx.sellReturn.update({
      where: { id },
      data: {
        subtotal: subtotal.toDecimalPlaces(2),
        discountAmount: discountAmount.toDecimalPlaces(2),
        taxAmount: taxAmount.toDecimalPlaces(2),
        totalAmount: totalAmount.toDecimalPlaces(2),
        paymentStatus,
        notes: input.notes,
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
    });

    await applyItemEffects(tx, existing.sale, lines, id, existing.createdBy);

    // Only the item scope changed - refundedAmount is untouched, so re-derive just the shift in
    // totalAmount's contribution to the customer's balance (see create()'s netBalanceChange note).
    const totalDelta = totalAmount.sub(existing.totalAmount);
    await tx.customer.update({ where: { id: existing.customerId }, data: { balance: { increment: totalDelta.neg().toDecimalPlaces(2) } } });

    return tx.sellReturn.findUniqueOrThrow({ where: { id }, include: { items: true } });
  });
}

interface AddSellReturnPaymentInput {
  amount: number;
  paymentMethodId: string;
  notes?: string;
}

/** Reference's own "Add Payment" row action (only shown there while payment_status != paid) -
 * records more cash handed back on a return that was left partially or entirely as store credit.
 * Deliberately additive-only, mirroring sale.service.ts's payDue(): a new Payment row plus the
 * refunded/status recompute, never touching the return's item scope (that's update() above). */
export async function addPayment(id: string, input: AddSellReturnPaymentInput, organizationId: string, createdBy: string) {
  const sellReturn = await prisma.sellReturn.findFirst({ where: { id, organizationId }, include: { sale: true } });
  if (!sellReturn) throw new NotFoundError("Sell return not found");

  const due = sellReturn.totalAmount.sub(sellReturn.refundedAmount);
  const amount = new Decimal(input.amount);
  if (amount.gt(due)) {
    throw new ValidationError([{ field: "amount", message: `Amount cannot exceed this return's due of ${due.toFixed(2)}` }]);
  }

  return prisma.$transaction(async (tx) => {
    await createRefundPayment(tx, sellReturn.sale, id, amount, input.paymentMethodId, createdBy, organizationId, input.notes);

    const newRefundedAmount = sellReturn.refundedAmount.add(amount).toDecimalPlaces(2);
    const paymentStatus = newRefundedAmount.gte(sellReturn.totalAmount) ? "PAID" : "PARTIAL";
    const updated = await tx.sellReturn.update({ where: { id }, data: { refundedAmount: newRefundedAmount, paymentStatus } });

    // More cash actually handed back discharges that much of the store-credit obligation left on
    // the account at creation time (see create()'s netBalanceChange note).
    await tx.customer.update({ where: { id: sellReturn.customerId }, data: { balance: { increment: amount.toDecimalPlaces(2) } } });

    return updated;
  });
}

/** Voids a return: reverses stock, reverts any fulfillment-status cancellation it caused, reverses
 * the customer balance adjustment, and removes every refund payment (there may be more than one -
 * see addPayment() above) and its register ledger entries. */
export async function remove(id: string, organizationId: string) {
  const sellReturn = await prisma.sellReturn.findFirst({
    where: { id, organizationId },
    include: { items: { include: { saleItem: true } } },
  });
  if (!sellReturn) throw new NotFoundError("Sell return not found");

  return prisma.$transaction(async (tx) => {
    await reverseItemEffects(tx, sellReturn);

    // Undo the balance netting applied at creation (and any later addPayment() calls).
    const netBalanceChange = sellReturn.refundedAmount.sub(sellReturn.totalAmount);
    await tx.customer.update({ where: { id: sellReturn.customerId }, data: { balance: { decrement: netBalanceChange } } });

    const refundPayments = await tx.payment.findMany({
      where: { referenceNumber: sellReturn.id, type: "REFUND" },
      include: { paymentMethod: { select: { code: true } } },
    });
    if (refundPayments.some((p) => p.paymentMethod.code === "CASH")) {
      await tx.registerTransaction.deleteMany({ where: { referenceType: "REFUND", referenceId: sellReturn.id } });
    }
    await tx.payment.deleteMany({ where: { referenceNumber: sellReturn.id, type: "REFUND" } });

    await tx.sellReturn.delete({ where: { id: sellReturn.id } });
  });
}

const SORTABLE_FIELDS = ["returnDate", "totalAmount", "refundedAmount", "createdAt"];

// Filters converted from the reference's own sell_return/index.blade.php + SellReturnController@
// index: Business Location, Customer, Date Range, Created By, Payment Status, Returned Reason.
// Location Group and Machine are NOT built - this app has no business-location-group filter
// anywhere else yet and no equipment/machine concept at all (reference's own laundry-machine
// tracking, not present in this codebase).
export async function list(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "createdAt");
  const where: Prisma.SellReturnWhereInput = {
    organizationId,
    ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}),
    ...(query.businessLocationId ? { businessLocationId: String(query.businessLocationId) } : {}),
    ...(query.customerId ? { customerId: String(query.customerId) } : {}),
    ...(query.createdBy ? { createdBy: String(query.createdBy) } : {}),
    ...(query.paymentStatus ? { paymentStatus: query.paymentStatus as "PAID" | "PARTIAL" | "DUE" | "OVERPAID" } : {}),
    ...(query.reason ? { items: { some: { reason: query.reason as ReturnReason } } } : {}),
    ...(query.from || query.to
      ? {
          returnDate: {
            ...(query.from ? { gte: new Date(String(query.from)) } : {}),
            ...(query.to ? { lte: new Date(String(query.to)) } : {}),
          },
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.sellReturn.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        sale: { select: { id: true, invoiceNumber: true } },
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

// Reference's own "View" action (SellReturnController@show) - the detail modal. `refundPayments`
// is a list (not a single row) since addPayment() above can record more than one over time.
export async function getById(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  const sellReturn = await prisma.sellReturn.findFirst({
    where: { id, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
    include: {
      sale: { select: { id: true, invoiceNumber: true, saleDate: true } },
      customer: { select: { nameEn: true, nameAr: true, phone: true } },
      businessLocation: { select: { branchName: true, businessNameEn: true, businessNameAr: true, vatNumber: true, crNumber: true, city: true, currency: true } },
      createdByUser: { select: { fullNameEn: true } },
      items: { include: { saleItem: { select: { descriptionEn: true, descriptionAr: true } } } },
    },
  });
  if (!sellReturn) throw new NotFoundError("Sell return not found");

  const refundPayments = await prisma.payment.findMany({
    where: { referenceNumber: sellReturn.id, type: "REFUND" },
    include: { paymentMethod: { select: { nameEn: true, nameAr: true } } },
    orderBy: { createdAt: "asc" },
  });

  return { ...sellReturn, refundPayments };
}
