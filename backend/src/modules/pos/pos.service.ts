import { randomUUID, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError, NotFoundError, ValidationError } from "../../utils/AppError";
import { CheckoutInput, HoldSaleInput, ConfirmQuoteInput, SendQuoteNotificationInput } from "./pos.validators";
import type { z } from "zod";
import type { applyCouponSchema, applyPromotionSchema } from "../promotions/promotion.validators";

type ApplyPromotionInput = z.infer<typeof applyPromotionSchema>;
import { computeInvoiceHash, computeXmlInvoiceHash, GENESIS_PREVIOUS_HASH } from "../zatca/hashChain.service";
import { buildQrTlvBase64, buildSignedQrTlvBase64 } from "../zatca/qrCode.service";
import { buildInvoiceXml, UblInvoiceLine } from "../zatca/xmlGenerator.service";
import { signInvoiceXml } from "../zatca/digitalSignature.service";
import { decryptSecret } from "../../utils/secretBox";
import { resolvePriceListId, getPriceOverrides, resolveGroupDiscountPercent, applyPercentAdjustment } from "../priceLists/priceListResolver";
import { parsePagination, parseSort } from "../../utils/pagination";
import { sendTemplatedSms, sendTemplatedEmail } from "../notifications/notifications.service";
import { claimBusinessLocationNumber } from "../../utils/documentNumbering";
import { resolveBusinessLocationFilter } from "../../utils/locationScope";
import { adjustCashbackTx } from "../cashback/cashback.service";
import { verifyAndConsumeSessionTx } from "../bnpl/bnpl.service";
import { BNPL_PAYMENT_CODES } from "../bnpl/bnpl.constants";
import { TAX_EXEMPTION_REASONS } from "../zatca/taxExemptionReasons";
import { env } from "../../config/env";
import { finalizeNewPayments } from "../paymentAccounts/paymentAccountLink";
import {
  assertCashbackRedeemAllowed,
  buildEngineLines,
  cashBackAmount,
  resolvePromotion,
  type PricedCartRow,
  type ResolvedPromotion,
} from "../promotions/promotion.service";
import { isValidCouponOtp, resolveCartCoupon } from "../coupons/coupon.service";
import { fitCoupon, type CouponLine } from "../coupons/couponEngine";
import { discountAmountFor, matchDiscounts } from "../discounts/discount.service";
import type { Coupon, Discount } from "@prisma/client";

const { Decimal } = Prisma;

// ZATCA's cbc:IssueDate/cbc:IssueTime (and the QR's timestamp field) must reflect the seller's
// own local wall-clock time, not UTC - a plain `saleDate.toISOString()` silently stamped every
// invoice with UTC instead, which is 3 hours behind Asia/Riyadh (any sale between 00:00-03:00
// local time was even dated the wrong calendar day). Uses the location's own configured
// `timezone` rather than hardcoding a fixed +3 offset, so this stays correct if this system is
// ever used from a different timezone.
function toLocationLocalParts(date: Date, timezone: string): { dateIso: string; timeIso: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    dateIso: `${get("year")}-${get("month")}-${get("day")}`,
    timeIso: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

// Maps this app's PaymentMethod codes to ZATCA/UBL's UNCL4461 payment-means codes. CASHBACK/
// STORE_CREDIT/BNPL_* have no real UNCL4461 instrument - "1" (Instrument not defined) is the
// honest code for those rather than guessing a wrong specific one.
const PAYMENT_MEANS_CODE_BY_METHOD: Record<string, string> = {
  CASH: "10",
  CARD: "48",
  ONLINE: "42",
};

async function resolvePaymentMeansCodes(tx: Prisma.TransactionClient, payments: { paymentMethodId: string }[]): Promise<string[]> {
  if (payments.length === 0) return ["1"];
  const methods = await tx.paymentMethod.findMany({
    where: { id: { in: payments.map((p) => p.paymentMethodId) } },
    select: { id: true, code: true },
  });
  const codeById = new Map(methods.map((m) => [m.id, m.code]));
  const means = new Set(payments.map((p) => PAYMENT_MEANS_CODE_BY_METHOD[codeById.get(p.paymentMethodId) ?? ""] ?? "1"));
  return Array.from(means);
}

// Reference's own 4 fixed custom_field_N slots - by array index (customFields[0] -> field 1, ...).
function buildCustomFieldsData(customFields: string[] | undefined) {
  return {
    customField1: customFields?.[0],
    customField2: customFields?.[1],
    customField3: customFields?.[2],
    customField4: customFields?.[3],
  };
}

// Reference's own 4 fixed additional_expense_key_N/_value_N slots - see checkout()'s comment on
// why these are untaxed flat pass-through charges rather than part of the taxable subtotal.
function buildAdditionalExpensesData(expenses: { key: string; value: number }[] | undefined) {
  const e = expenses ?? [];
  return {
    additionalExpense1Key: e[0]?.key,
    additionalExpense1Value: e[0]?.value ?? 0,
    additionalExpense2Key: e[1]?.key,
    additionalExpense2Value: e[1]?.value ?? 0,
    additionalExpense3Key: e[2]?.key,
    additionalExpense3Value: e[2]?.value ?? 0,
    additionalExpense4Key: e[3]?.key,
    additionalExpense4Value: e[3]?.value ?? 0,
  };
}

export async function search(
  businessLocationId: string,
  query: string | undefined,
  organizationId: string,
  customerId?: string,
  mode?: "SERVICE" | "PRODUCT",
) {
  const search = (query ?? "").trim();

  const priceListId = await resolvePriceListId(prisma, customerId, organizationId, businessLocationId);
  const overrides = await getPriceOverrides(prisma, priceListId);
  const groupDiscountPercent = await resolveGroupDiscountPercent(prisma, customerId, organizationId);

  const [products, services] = await Promise.all([
    mode === "SERVICE"
      ? Promise.resolve([])
      : prisma.product.findMany({
          where: {
            organizationId,
            status: "ACTIVE",
            deletedAt: null,
            businessLocations: { some: { businessLocationId } },
            ...(search
              ? {
                  OR: [
                    { nameEn: { contains: search, mode: "insensitive" } },
                    { nameAr: { contains: search } },
                    { sku: { contains: search, mode: "insensitive" } },
                    { barcode: { equals: search } },
                  ],
                }
              : {}),
          },
          include: { tax: true, unit: true, stocks: { where: { businessLocationId } } },
          take: 25,
        }),
    mode === "PRODUCT"
      ? Promise.resolve([])
      : prisma.service.findMany({
          where: {
            organizationId,
            status: "ACTIVE",
            businessLocations: { some: { businessLocationId } },
            ...(search
              ? {
                  OR: [
                    { nameEn: { contains: search, mode: "insensitive" } },
                    { nameAr: { contains: search } },
                    { code: { contains: search, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          include: { tax: true, unit: true },
          take: 25,
        }),
  ]);

  return {
    products: products.map((p) => ({
      type: "PRODUCT" as const,
      id: p.id,
      nameEn: p.nameEn,
      nameAr: p.nameAr,
      sku: p.sku,
      barcode: p.barcode,
      price: applyPercentAdjustment(overrides.products.get(p.id) ?? p.sellingPrice, groupDiscountPercent),
      taxPercent: p.tax?.percentage ?? new Decimal(0),
      taxType: p.sellingPriceTaxType,
      unit: p.unit.shortName,
      manageStock: p.manageStock,
      stockOnHand: p.stocks[0]?.quantity ?? new Decimal(0),
    })),
    services: services.map((s) => ({
      type: "SERVICE" as const,
      id: s.id,
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      code: s.code,
      price: applyPercentAdjustment(overrides.services.get(s.id) ?? s.price, groupDiscountPercent),
      taxPercent: s.tax?.percentage ?? new Decimal(0),
      taxType: "EXCLUSIVE" as const,
      unit: s.unit.shortName,
    })),
  };
}

// Backs the per-line tax-override dropdown (reference's row_edit_product_price_modal.blade.php) -
// deliberately not the full /taxes CRUD endpoint (gated by "taxes.view", which a Store Manager
// holding pos.editLinePrice doesn't necessarily have) since this only exposes the same
// name/percentage a cashier already sees on every product/service tile.
export async function listActiveTaxes(organizationId: string) {
  return prisma.tax.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, nameEn: true, nameAr: true, percentage: true, categoryCode: true },
    orderBy: { nameEn: "asc" },
  });
}

// Enforces that every cart/held-sale item matches the POS mode the request declared itself as
// coming from - e.g. a Service POS checkout (mode: "SERVICE") may not contain a productId line.
// A no-op when mode is omitted, which is exactly what the legacy /pos screen and any caller that
// predates this concept relies on (mixed carts stay allowed there). This is the item-level half
// of the enforcement; pos.routes.ts's requireModePermission is the other half (does this user
// have permission to use this mode at all) - both are needed since this check alone only proves
// the cart is internally consistent with the claimed mode, not that the caller was allowed to
// claim it.
function assertItemsMatchMode(items: { productId?: string; serviceId?: string }[], mode: "SERVICE" | "PRODUCT" | undefined) {
  if (!mode) return;
  const badIndex = items.findIndex((item) => (mode === "SERVICE" ? item.productId : item.serviceId));
  if (badIndex !== -1) {
    throw new ValidationError(
      [{ field: `items[${badIndex}]`, message: `This item is not allowed in ${mode === "SERVICE" ? "Service" : "Product"} POS` }],
      `Cart contains an item that does not belong in ${mode === "SERVICE" ? "Service" : "Product"} POS`,
    );
  }
}

interface PricedLine {
  productId?: string;
  serviceId?: string;
  descriptionEn: string;
  descriptionAr: string | null;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  taxPercent: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  total: Prisma.Decimal;
  manageStock: boolean;
  taxCategoryCode: string;
  estimatedProcessingHours?: number | null;
  note?: string;
  widthM?: Prisma.Decimal;
  heightM?: Prisma.Decimal;
  promotionId?: string;
  discountId?: string;
  couponId?: string;
}

async function priceLine(
  tx: Prisma.TransactionClient,
  item: CheckoutInput["items"][number],
  businessLocationId: string,
  organizationId: string,
  overrides: { products: Map<string, Prisma.Decimal>; services: Map<string, Prisma.Decimal> },
  groupDiscountPercent: Prisma.Decimal,
  canEditLinePrice: boolean,
  // Promotions > Discounts: the discount this line carries (already re-checked by
  // resolveLineDiscounts). Its amount is computed here from the resolved unit price, replacing
  // whatever amount the client sent.
  lineDiscount?: Discount,
): Promise<PricedLine> {
  // Reference's own laundry dimension-based pricing (carpets/curtains priced per m²) - when both
  // are sent, the quantity actually billed is scaled by the area, on top of however many pieces
  // were entered (e.g. 3 rugs at 2m x 1.5m each = 3 * 3m² = 9 billable units).
  const hasDimensions = item.widthM != null && item.heightM != null;
  const quantity = hasDimensions ? new Decimal(item.quantity).mul(item.widthM!).mul(item.heightM!) : new Decimal(item.quantity);
  const lineDiscountAmount = (unitPrice: Prisma.Decimal) =>
    lineDiscount ? discountAmountFor(lineDiscount, unitPrice, quantity) : new Decimal(item.discountAmount ?? 0);

  // Reference's own `edit_product_price_from_sale_screen` permission gates a per-line unit-price
  // AND tax override (`row_edit_product_price_modal.blade.php`) - a caller without it gets these
  // fields silently ignored rather than rejected, since the rest of a valid checkout should still
  // go through; the override only ever WINS when both the permission and a sent value are present.
  let taxOverride: { percentage: Prisma.Decimal; categoryCode: string } | undefined;
  if (canEditLinePrice && item.taxId) {
    const tax = await tx.tax.findFirst({ where: { id: item.taxId, organizationId } });
    if (tax) taxOverride = { percentage: tax.percentage, categoryCode: tax.categoryCode };
  }

  if (item.productId) {
    const product = await tx.product.findFirst({
      where: { id: item.productId, organizationId, status: "ACTIVE", deletedAt: null, businessLocations: { some: { businessLocationId } } },
      include: { tax: true },
    });
    if (!product) throw new NotFoundError(`Product not found or not available at this location: ${item.productId}`);

    const unitPrice =
      canEditLinePrice && item.unitPriceOverride != null
        ? new Decimal(item.unitPriceOverride)
        : applyPercentAdjustment(overrides.products.get(product.id) ?? product.sellingPrice, groupDiscountPercent);
    const taxPercent = taxOverride?.percentage ?? product.tax?.percentage ?? new Decimal(0);
    const discountAmount = lineDiscountAmount(unitPrice);
    const gross = unitPrice.mul(quantity).sub(discountAmount);
    let subtotal: Prisma.Decimal;
    let taxAmount: Prisma.Decimal;
    if (product.sellingPriceTaxType === "INCLUSIVE" && !taxOverride) {
      const divisor = new Decimal(1).add(taxPercent.div(100));
      subtotal = gross.div(divisor);
      taxAmount = gross.sub(subtotal);
    } else {
      subtotal = gross;
      taxAmount = gross.mul(taxPercent).div(100);
    }

    return {
      productId: product.id,
      descriptionEn: product.nameEn,
      descriptionAr: product.nameAr,
      quantity,
      unitPrice,
      taxPercent,
      taxAmount: taxAmount.toDecimalPlaces(2),
      discountAmount,
      subtotal: subtotal.toDecimalPlaces(2),
      // subtotal + tax, not `gross`: gross already includes tax only for INCLUSIVE pricing - for the
      // default EXCLUSIVE pricing it's the pre-tax amount, which left product lines' total short of their VAT.
      total: subtotal.add(taxAmount).toDecimalPlaces(2),
      manageStock: product.manageStock,
      taxCategoryCode: taxOverride?.categoryCode ?? product.tax?.categoryCode ?? "S",
      note: item.note,
      widthM: item.widthM != null ? new Decimal(item.widthM) : undefined,
      heightM: item.heightM != null ? new Decimal(item.heightM) : undefined,
      discountId: lineDiscount?.id,
    };
  }

  const service = await tx.service.findFirst({
    where: { id: item.serviceId, organizationId, status: "ACTIVE", businessLocations: { some: { businessLocationId } } },
    include: { tax: true },
  });
  if (!service) throw new NotFoundError(`Service not found or not available at this location: ${item.serviceId}`);

  const unitPrice =
    canEditLinePrice && item.unitPriceOverride != null
      ? new Decimal(item.unitPriceOverride)
      : applyPercentAdjustment(overrides.services.get(service.id) ?? service.price, groupDiscountPercent);
  const taxPercent = taxOverride?.percentage ?? service.tax?.percentage ?? new Decimal(0);
  const discountAmount = lineDiscountAmount(unitPrice);
  const subtotal = unitPrice.mul(quantity).sub(discountAmount);
  const taxAmount = subtotal.mul(taxPercent).div(100);

  return {
    serviceId: service.id,
    descriptionEn: service.nameEn,
    descriptionAr: service.nameAr,
    quantity,
    unitPrice,
    taxPercent,
    taxAmount: taxAmount.toDecimalPlaces(2),
    discountAmount,
    subtotal: subtotal.toDecimalPlaces(2),
    total: subtotal.add(taxAmount).toDecimalPlaces(2),
    manageStock: false,
    taxCategoryCode: taxOverride?.categoryCode ?? service.tax?.categoryCode ?? "S",
    estimatedProcessingHours: service.estimatedProcessingHours,
    note: item.note,
    widthM: item.widthM != null ? new Decimal(item.widthM) : undefined,
    heightM: item.heightM != null ? new Decimal(item.heightM) : undefined,
    discountId: lineDiscount?.id,
  };
}

/**
 * Promotions > Discounts at checkout: a line that arrives with a `discountId` keeps it only if
 * that discount still applies to the item right now (same branch / window / customer group /
 * selling price group rules the POS used to pre-fill it); its amount is then recomputed from the
 * real price. A discount that no longer applies is dropped, so its amount is never trusted.
 */
async function resolveLineDiscounts(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; businessLocationId: string; customerGroupId: string | null; priceListId: string | null; items: { productId?: string; serviceId?: string; discountId?: string }[] },
) {
  const keyOf = (item: { productId?: string; serviceId?: string }) => (item.productId ? `p:${item.productId}` : `s:${item.serviceId}`);
  const wanted = args.items.filter((i) => i.discountId);
  const matches = wanted.length
    ? await matchDiscounts(tx, { ...args, itemKeys: wanted.map(keyOf) })
    : new Map<string, Discount>();
  return (item: { productId?: string; serviceId?: string; discountId?: string }) => {
    if (!item.discountId) return undefined;
    const match = matches.get(keyOf(item));
    return match?.id === item.discountId ? match : undefined;
  };
}

type CartItem = CheckoutInput["items"][number];

/** The priced cart rows the promotion engine reads (see promotions/promotionEngine.ts). */
function toPricedRows(items: CartItem[], priced: PricedLine[]): PricedCartRow[] {
  return items.map((item, i) => ({
    productId: item.productId,
    serviceId: item.serviceId,
    pieces: new Decimal(item.quantity),
    areaFactor: item.widthM != null && item.heightM != null ? new Decimal(item.widthM).mul(item.heightM) : new Decimal(1),
    unitPrice: priced[i].unitPrice,
    total: priced[i].total,
  }));
}

/**
 * Turns the engine's segments back into cart rows - pos.js splits a row where the promoted
 * quantity runs out and gives the promoted part the promotion's line discount, replacing any
 * manual one; the untouched remainder keeps its share of the row's own discount.
 */
function promotionCartItems(resolved: ResolvedPromotion, items: CartItem[]) {
  return resolved.result.segments.map((seg) => {
    const src = items[seg.sourceIndex];
    const discountAmount = seg.discountAmount
      ? seg.discountAmount.toNumber()
      : src.discountAmount
        ? new Decimal(src.discountAmount).mul(seg.pieces).div(src.quantity).toDecimalPlaces(2).toNumber()
        : undefined;
    const item = { ...src, quantity: seg.pieces.toNumber(), discountAmount, ...(seg.promoted ? { discountId: undefined } : {}) };
    return { item, promotionId: seg.promoted ? resolved.promotion.id : undefined };
  });
}

/**
 * Promotions > Coupons at checkout (reference applyCouponSuccess): fits the coupon to the priced
 * lines and re-prices every line it discounts with the coupon's share added to that line's own
 * discount, stamping the line with the coupon (reference transaction_sell_lines.coupon_id).
 * Throws the reference's own messages when the cart doesn't qualify.
 */
async function applyCouponToLines(
  tx: Prisma.TransactionClient,
  args: {
    organizationId: string;
    coupon: Coupon;
    items: CartItem[];
    lines: PricedLine[];
    price: (item: CartItem) => Promise<PricedLine>;
  },
) {
  const engineLines = await buildEngineLines(tx, args.organizationId, toPricedRows(args.items, args.lines));
  const couponLines: CouponLine[] = args.lines.map((l, i) => ({
    key: engineLines[i].key,
    categoryKey: engineLines[i].categoryKey,
    brandId: engineLines[i].brandId,
    base: l.unitPrice.mul(l.quantity).sub(l.discountAmount),
    total: l.total,
  }));
  const fit = fitCoupon(args.coupon, couponLines);
  if (!fit.ok) throw new AppError(400, fit.reason);
  const lines = await Promise.all(
    args.lines.map(async (line, i) => {
      const share = fit.discounts[i];
      if (share.lte(0)) return line;
      const repriced = await args.price({ ...args.items[i], discountId: undefined, discountAmount: line.discountAmount.add(share).toNumber() });
      return { ...repriced, discountId: line.discountId, promotionId: line.promotionId, couponId: args.coupon.id };
    }),
  );
  return { lines, discountAmount: fit.discounts.reduce((s, d) => s.add(d), new Decimal(0)).toDecimalPlaces(2) };
}

async function paymentCodes(tx: Prisma.TransactionClient, payments: { paymentMethodId: string }[]) {
  if (!payments.length) return new Map<string, string>();
  const methods = await tx.paymentMethod.findMany({ where: { id: { in: payments.map((p) => p.paymentMethodId) } }, select: { id: true, code: true } });
  return new Map(methods.map((m) => [m.id, m.code]));
}

/**
 * Promotion rules that bite when an invoice is actually paid: a "Full Cash" promotion must be
 * paid in full, in cash (the reference locks the payment row to the full amount and the cash
 * method), and cash back can't be spent while a "Redeem After Offer Expiry" cash back offer runs.
 */
async function assertPromotionPaymentRules(
  tx: Prisma.TransactionClient,
  organizationId: string,
  promotion: { fullCash: boolean; name: string } | null,
  payments: { paymentMethodId: string; amount: number }[],
  codes: Map<string, string>,
  totalAmount: Prisma.Decimal,
  appliedCreditAmount: Prisma.Decimal,
) {
  if (promotion?.fullCash) {
    const cash = payments.reduce((sum, p) => sum.add(new Decimal(p.amount)), new Decimal(0));
    const allCash = payments.every((p) => codes.get(p.paymentMethodId) === "CASH");
    if (!allCash || appliedCreditAmount.gt(0) || cash.lt(totalAmount)) {
      throw new AppError(400, `The promotion "${promotion.name}" requires the full amount (${totalAmount.toFixed(2)}) paid in cash`);
    }
  }
  if (payments.some((p) => codes.get(p.paymentMethodId) === "CASHBACK")) {
    await assertCashbackRedeemAllowed(tx, organizationId);
  }
}

/** Reference handleCashBackWithPromotions(): the cash back a Cash back promotion earns. */
async function grantPromotionCashback(
  tx: Prisma.TransactionClient,
  args: {
    promotion: { id: string; name: string; type: string; cashBackValue: Prisma.Decimal | null; pointsForCashBack: Prisma.Decimal | null; cashBackExpirationDays: number | null };
    customerId: string;
    saleId: string;
    invoiceNumber: string;
    totalAmount: Prisma.Decimal;
    payments: { paymentMethodId: string; amount: number }[];
    codes: Map<string, string>;
    organizationId: string;
    createdBy: string;
  },
) {
  if (args.promotion.type !== "CASH_BACK") return;
  // Reference: earned on the final total less any cash back spent on this same invoice.
  const redeemed = args.payments.filter((p) => args.codes.get(p.paymentMethodId) === "CASHBACK").reduce((sum, p) => sum.add(new Decimal(p.amount)), new Decimal(0));
  const amount = cashBackAmount(args.promotion, args.totalAmount.sub(redeemed));
  if (amount.lte(0)) return;
  const expiresAt = args.promotion.cashBackExpirationDays ? new Date(Date.now() + args.promotion.cashBackExpirationDays * 24 * 60 * 60 * 1000) : undefined;
  await adjustCashbackTx(tx, args.customerId, amount, "GRANT", `${args.promotion.name} on ${args.invoiceNumber}`, args.organizationId, args.createdBy, {
    saleId: args.saleId,
    promotionId: args.promotion.id,
    expiresAt,
  });
}

export async function checkout(
  input: CheckoutInput,
  createdBy: string,
  organizationId: string,
  callerPermissions: string[] = [],
  // Reference's own "Edit" action on a draft/quotation (SellPosController@edit -> update()) -
  // reopens this exact same create-sale pipeline, pre-filled and resubmittable, then saves back
  // onto the SAME transaction row instead of creating a new one. Set only by updateQuote() below.
  // Left undefined for every other caller (real checkout, Save as Quote/Delivery), which keeps
  // creating a fresh row exactly as before.
  existingDraftId?: string,
) {
  assertItemsMatchMode(input.items, input.mode);

  const sale = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, organizationId, deletedAt: null } });
    if (!customer) throw new NotFoundError("Customer not found");

    if (customer.approvalStatus === "PENDING") {
      throw new AppError(400, "Customer is pending approval");
    }

    // Fetched once, reused for the invoiceType default below and the monthly-cap check further
    // down - avoids querying the same group twice.
    const customerGroup = customer.customerGroupId ? await tx.customerGroup.findUnique({ where: { id: customer.customerGroupId } }) : null;

    // A group set to "Delivery Invoice" (EJADA reference's invoice_type) means every new sale for
    // its customers starts as this system's own DRAFT status by default - our DRAFT/FINAL Sale
    // distinction IS the delivery-ticket-vs-finalized-invoice distinction the reference describes.
    // An explicit `input.asDraft: true` (the "Save as Quote" flow) always wins either way.
    const effectiveAsDraft = input.asDraft || customerGroup?.invoiceType === "DELIVERY";

    // Per-user access restrictions (P8-5) - fetched once, used for both the customer-access check
    // right below and the discount-ceiling check further down. Never trust the client past this;
    // a restricted cashier could otherwise type a customerId they aren't allowed to serve.
    const actor = await tx.user.findUniqueOrThrow({
      where: { id: createdBy },
      include: { customerRestrictions: { select: { customerId: true } }, customerGroupRestrictions: { select: { customerGroupId: true } } },
    });
    if (!actor.isSystemAdmin) {
      const allowedCustomerIds = actor.customerRestrictions.length > 0 ? actor.customerRestrictions.map((r) => r.customerId) : null;
      const allowedCustomerGroupIds =
        actor.customerGroupRestrictions.length > 0 ? actor.customerGroupRestrictions.map((r) => r.customerGroupId) : null;
      const customerAllowed = !allowedCustomerIds || allowedCustomerIds.includes(customer.id);
      const groupAllowed =
        !allowedCustomerGroupIds || (customer.customerGroupId != null && allowedCustomerGroupIds.includes(customer.customerGroupId));
      if ((allowedCustomerIds || allowedCustomerGroupIds) && !customerAllowed && !groupAllowed) {
        throw new AppError(403, "You do not have access to this customer");
      }
    }

    const org = await tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        rewardPointsEnabled: true,
        pointValueSar: true,
        pointsEarnDivisor: true,
        minOrderForPoints: true,
        maxPointsPerOrder: true,
        minRedeemPoints: true,
        maxRedeemPoints: true,
      },
    });

    // ZATCA requires Arabic content on every invoice. Block issuance rather than silently
    // falling back to English, per docs/POS-ZATCA-PLAN.md section 7.
    if (!customer.nameAr?.trim()) {
      throw new ValidationError(
        [{ field: "customerId", message: "Customer needs an Arabic name before an invoice can be issued (ZATCA requirement)" }],
        "Customer is missing required Arabic name",
      );
    }

    // findFirst (not findUnique) so a businessLocationId from a DIFFERENT organization never
    // matches, even for a System Admin - isSystemAdmin only bypasses location assignment
    // WITHIN their own org, never crosses tenant boundaries.
    const businessLocation = await tx.businessLocation.findFirst({ where: { id: input.businessLocationId, organizationId } });
    if (!businessLocation) throw new NotFoundError("Business location not found");

    // Attributes this sale to the currently open register session, if any. Purely informational
    // for cash reconciliation at close-out - checkout still works with no register open.
    const openRegisterSession = await tx.registerSession.findFirst({
      where: { businessLocationId: input.businessLocationId, organizationId, status: "OPEN" },
      select: { id: true },
    });

    if (!businessLocation.vatNumber?.trim()) {
      throw new ValidationError(
        [{ field: "businessLocationId", message: "This business location has no VAT number configured (ZATCA requirement)" }],
        "Business location is missing a VAT number",
      );
    }

    // Add Sale's own "Selling Price Group" field (`sell/create.blade.php`) lets the cashier
    // consciously override the customer/location-derived default for THIS one sale - validated
    // to actually belong to this org (never trust a client-sent id past that) before use, then
    // recorded on the Sale row itself (see priceListId below) so a report can see what actually
    // priced this invoice, matching the reference's own `selling_price_group_id` column.
    let priceListId = await resolvePriceListId(tx, input.customerId, organizationId, input.businessLocationId);
    if (input.priceListId) {
      const overridePriceList = await tx.priceList.findFirst({ where: { id: input.priceListId, organizationId } });
      if (!overridePriceList) throw new NotFoundError("Selling price group not found");
      priceListId = overridePriceList.id;
    }
    const overrides = await getPriceOverrides(tx, priceListId);
    const groupDiscountPercent = await resolveGroupDiscountPercent(tx, input.customerId, organizationId);

    // Add Sale's "Attach Document" - documentPath was already validated by shape (see
    // checkoutSchema), but its org segment is still just a client-echoed string, so it's checked
    // against the caller's real organizationId here before being trusted enough to persist -
    // otherwise a caller could get another org's uploaded file linked onto their own sale (no data
    // leak on its own since download re-checks the Sale's org too, but still not a value to trust
    // past this point without verifying it actually matches).
    if (input.documentPath && !input.documentPath.startsWith(`sale-documents/${organizationId}/`)) {
      throw new ValidationError(
        [{ field: "documentPath", message: "This document was not uploaded by this organization" }],
        "Invalid document reference",
      );
    }
    const canEditLinePrice = actor.isSystemAdmin || callerPermissions.includes("pos.editLinePrice");
    // --- Coupon (reference SellPosController@applyCoupon): checked first, because a coupon without
    // "Added Discount" replaces every other discount on the cart (reference applyCouponSuccess
    // cancels the promotion and zeroes each row's line discount). ---
    const coupon = input.couponCode?.trim()
      ? await resolveCartCoupon(tx, {
          organizationId,
          code: input.couponCode,
          businessLocation: { id: businessLocation.id, groupId: businessLocation.groupId },
          customer: { id: customer.id, customerGroupId: customer.customerGroupId },
        })
      : null;
    if (coupon?.otp && !isValidCouponOtp(coupon.id, customer.id, input.couponOtp)) {
      throw new AppError(400, "Invalid verification code");
    }
    const cartItems: CartItem[] = coupon && !coupon.addedDiscount ? input.items.map((item) => ({ ...item, discountId: undefined, discountAmount: 0 })) : input.items;
    const lineDiscountOf = await resolveLineDiscounts(tx, {
      organizationId,
      businessLocationId: input.businessLocationId,
      customerGroupId: customer.customerGroupId,
      priceListId,
      items: cartItems,
    });
    const price = (item: CartItem) => {
      const lineDiscount = lineDiscountOf(item);
      // A pre-filled discount that no longer applies takes its amount with it.
      const priced = item.discountId && !lineDiscount ? { ...item, discountId: undefined, discountAmount: 0 } : item;
      return priceLine(tx, priced, input.businessLocationId, organizationId, overrides, groupDiscountPercent, canEditLinePrice, lineDiscount);
    };
    const baseLines = await Promise.all(cartItems.map(price));

    // --- Promotion (reference SellPosController@applyPromotion + pos.js) - the cashier's picked
    // promotion, or else the first auto-apply one that matches, re-evaluated here server-side so
    // the discount never comes from the client. ---
    const appliedPromotion = await resolvePromotion(tx, {
      organizationId,
      promotionId: input.promotionId,
      coupon,
      businessLocation: { id: businessLocation.id, groupId: businessLocation.groupId },
      customer: { id: customer.id, customerGroupId: customer.customerGroupId, priceListId: customer.priceListId },
      rows: toPricedRows(cartItems, baseLines),
    });
    const promotedItems = appliedPromotion ? promotionCartItems(appliedPromotion, cartItems) : null;
    const pricedItems: CartItem[] = promotedItems ? promotedItems.map((p) => p.item) : cartItems;
    const promotedLines: PricedLine[] = promotedItems
      ? await Promise.all(promotedItems.map(async ({ item, promotionId }) => ({ ...(await price(item)), promotionId })))
      : baseLines;
    const promotionId = appliedPromotion?.promotion.id ?? null;

    // Coupon on the lines it fits (after the promotion, when one is allowed alongside it).
    const couponResult = coupon ? await applyCouponToLines(tx, { organizationId, coupon, items: pricedItems, lines: promotedLines, price }) : null;
    const lines: PricedLine[] = couponResult ? couponResult.lines : promotedLines;
    const couponId: string | undefined = coupon?.id;
    const couponDiscountAmount = couponResult?.discountAmount ?? new Decimal(0);
    // A DRAFT quote hasn't actually "used" the coupon yet - nothing should need reversing if it's
    // later voided (see voidQuote), so usage is only counted once confirmQuote() runs.
    if (coupon && !effectiveAsDraft) {
      await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
    }

    // Server-derived from the actual priced lines - never trusts input.mode for this, since mode
    // is just the caller's declared intent (and may be absent entirely on the legacy /pos screen).
    const hasProductLine = lines.some((l) => l.productId);
    const hasServiceLine = lines.some((l) => l.serviceId);
    const saleType: "PRODUCT" | "SERVICE" | "MIXED" = hasProductLine && hasServiceLine ? "MIXED" : hasProductLine ? "PRODUCT" : "SERVICE";

    const lineSubtotal = lines.reduce((sum, l) => sum.add(l.subtotal), new Decimal(0));
    const lineTaxAmount = lines.reduce((sum, l) => sum.add(l.taxAmount), new Decimal(0));
    const lineDiscountAmount = lines.reduce((sum, l) => sum.add(l.discountAmount), new Decimal(0));

    // The coupon is already inside the line subtotals (it is a line discount, see applyCouponToLines),
    // so it reduces the taxable base line by line; couponDiscountAmount only records how much of the
    // line discounts came from it. Tax on the invoice-level discounts below is recomputed
    // proportionally on the reduced base - a reasonable approximation for a single-VAT-rate
    // storefront that does not attempt per-line reallocation across mixed tax categories.
    const effectiveTaxRate = lineSubtotal.gt(0) ? lineTaxAmount.div(lineSubtotal) : new Decimal(0);
    const subtotalAfterCoupon = lineSubtotal;

    // --- Manual invoice-level discount (the cashier's "Discount, shipping & totals" panel) ---
    // Priced here, server-side, never trusting a client-sent amount - same discipline as the
    // coupon above. Applied against the coupon-adjusted base so the two discounts stack rather
    // than double-count the same subtotal.
    let invoiceDiscountAmount = new Decimal(0);
    if (input.invoiceDiscountValue) {
      const raw =
        input.invoiceDiscountMode === "PERCENT"
          ? subtotalAfterCoupon.mul(input.invoiceDiscountValue).div(100)
          : new Decimal(input.invoiceDiscountValue);
      invoiceDiscountAmount = Decimal.min(raw, subtotalAfterCoupon).toDecimalPlaces(2);

      // Per-cashier discount ceiling (P8-5b) - checked against the discount actually applied
      // (post-clamp), not the raw request, and against the actor fetched above. Never applies to
      // a system admin.
      if (!actor.isSystemAdmin && actor.maxDiscountPercent != null && subtotalAfterCoupon.gt(0)) {
        const effectivePercent = invoiceDiscountAmount.div(subtotalAfterCoupon).mul(100);
        if (effectivePercent.gt(actor.maxDiscountPercent)) {
          throw new AppError(400, `Discount exceeds your maximum allowed discount of ${actor.maxDiscountPercent.toString()}%`);
        }
      }
    }

    // --- Loyalty points redemption: 1 point = org.pointValueSar currency units off, netted into
    // the taxable base like every other discount here. Never trust the client's requested point
    // count past the customer's actual balance, and floor to whole points so the ledger's point
    // count always matches the currency value actually discounted (no fractional points spent). ---
    const subtotalAfterInvoiceDiscount = subtotalAfterCoupon.sub(invoiceDiscountAmount);
    let redeemedPoints = 0;
    let pointsDiscountAmount = new Decimal(0);
    // Points aren't actually debited until a sale is real (see below) - a DRAFT quote's points
    // balance could easily have moved by the time it's confirmed, so redemption simply isn't
    // offered on a quote rather than risk debiting a stale count. Earning still happens normally
    // at confirm time, computed fresh from that point's totals.
    if (org.rewardPointsEnabled && !effectiveAsDraft) {
      const requestedPoints = Math.max(0, Math.min(input.redeemPoints ?? 0, customer.rewardPoints));
      const cappedRequest = org.maxRedeemPoints != null ? Math.min(requestedPoints, org.maxRedeemPoints) : requestedPoints;
      const maxAffordablePoints = subtotalAfterInvoiceDiscount.div(org.pointValueSar).floor().toNumber();
      const candidate = Math.min(cappedRequest, maxAffordablePoints);
      // Below the minimum redemption threshold, redeem nothing at all rather than a partial amount.
      redeemedPoints = candidate >= org.minRedeemPoints ? candidate : 0;
      pointsDiscountAmount = new Decimal(redeemedPoints).mul(org.pointValueSar).toDecimalPlaces(2);
    }

    // Shipping is a real (taxable) charge, not a discount - it's added to the taxable base
    // rather than tacked on after tax, so `subtotal + taxAmount` keeps meaning "the whole
    // invoice excl./incl. VAT" the way ZATCA's TaxExclusiveAmount/TaxInclusiveAmount expect.
    const shippingAmount = new Decimal(input.shipping ?? 0);

    const subtotal = subtotalAfterInvoiceDiscount.sub(pointsDiscountAmount).add(shippingAmount).toDecimalPlaces(2);
    const taxAmount = subtotal.mul(effectiveTaxRate).toDecimalPlaces(2);
    const discountAmount = lineDiscountAmount.add(invoiceDiscountAmount).add(pointsDiscountAmount);

    // Additional expenses (reference's 4 fixed named slots) are a flat, UNTAXED pass-through
    // charge added straight onto the grand total - unlike shippingAmount above, which is a real
    // taxable charge folded into subtotal before tax is computed. See buildAdditionalExpensesData.
    const additionalExpensesTotal = (input.additionalExpenses ?? []).reduce(
      (sum, e) => sum.add(new Decimal(e.value)),
      new Decimal(0),
    );
    const totalAmount = subtotal.add(taxAmount).add(additionalExpensesTotal);

    // --- Customer-group monthly spend/volume caps (P8-3) - enforced against the WHOLE group's
    // combined FINAL sales this calendar month by default, or against just this one customer's own
    // when the group's maxFor is CUSTOMER (EJADA reference's "For Customer"/"For Company" radio -
    // see the CustomerGroupCapScope schema comment). All-null on the group means unrestricted.
    // Quotes don't count against the cap - only real checkouts do. ---
    if (!effectiveAsDraft && customerGroup) {
      const group = customerGroup;
      if (group.maxAmountPerMonth != null || group.maxInvoicesPerMonth != null || group.maxQtyPerMonth != null) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const monthWhere: Prisma.SaleWhereInput = {
          organizationId,
          status: "FINAL",
          saleDate: { gte: monthStart, lt: monthEnd },
          ...(group.maxFor === "CUSTOMER" ? { customerId: customer.id } : { customer: { customerGroupId: group.id } }),
        };

        if (group.maxAmountPerMonth != null) {
          const existing = await tx.sale.aggregate({ where: monthWhere, _sum: { totalAmount: true } });
          const existingAmount = existing._sum.totalAmount ?? new Decimal(0);
          if (existingAmount.add(totalAmount).gt(group.maxAmountPerMonth)) {
            throw new AppError(400, `This customer group's monthly spend cap of ${group.maxAmountPerMonth.toFixed(2)} would be exceeded`);
          }
        }
        if (group.maxInvoicesPerMonth != null) {
          const existingCount = await tx.sale.count({ where: monthWhere });
          if (existingCount + 1 > group.maxInvoicesPerMonth) {
            throw new AppError(400, `This customer group's monthly invoice cap of ${group.maxInvoicesPerMonth} would be exceeded`);
          }
        }
        if (group.maxQtyPerMonth != null) {
          const qtyAgg = await tx.saleItem.aggregate({ where: { sale: monthWhere }, _sum: { quantity: true } });
          const existingQty = qtyAgg._sum.quantity ?? new Decimal(0);
          const thisQty = lines.reduce((sum, l) => sum.add(l.quantity), new Decimal(0));
          if (existingQty.add(thisQty).gt(group.maxQtyPerMonth)) {
            throw new AppError(400, `This customer group's monthly quantity cap of ${group.maxQtyPerMonth.toString()} would be exceeded`);
          }
        }
      }
    }

    // Earned on the final charged total, at the org's configured rate. No earn at all below the
    // configured minimum order, and capped per-order if a max is configured.
    let pointsEarned = 0;
    if (org.rewardPointsEnabled && totalAmount.gte(org.minOrderForPoints)) {
      pointsEarned = Math.floor(totalAmount.div(org.pointsEarnDivisor).toNumber());
      if (org.maxPointsPerOrder != null) pointsEarned = Math.min(pointsEarned, org.maxPointsPerOrder);
    }

    const paidAmount = input.payments.reduce((sum, p) => sum.add(new Decimal(p.amount)), new Decimal(0));
    const dueBeforeCredit = totalAmount.sub(paidAmount); // negative = customer overpaid (credit); this is what nets into customer.balance below

    // Store credit applied against THIS invoice. Capped at both what's actually still due and
    // what the customer actually has available - never trust the client's requested amount past
    // either bound. customer.balance stays keyed off dueBeforeCredit (not this reduced due), or
    // the credit just spent here would silently vanish from the balance instead of being spent.
    const availableCredit = customer.balance.lt(0) ? customer.balance.neg() : new Decimal(0);
    const requestedCredit = new Decimal(input.appliedCreditAmount ?? 0);
    const maxApplicableCredit = Decimal.max(Decimal.min(dueBeforeCredit, availableCredit), 0);
    if (requestedCredit.gt(maxApplicableCredit)) {
      throw new AppError(400, `Applied credit cannot exceed ${maxApplicableCredit.toFixed(2)} (due: ${dueBeforeCredit.toFixed(2)}, available credit: ${availableCredit.toFixed(2)})`);
    }
    const appliedCreditAmount = requestedCredit;
    const dueAmount = dueBeforeCredit.sub(appliedCreditAmount);
    const totalPaidIncludingCredit = paidAmount.add(appliedCreditAmount);

    let paymentStatus: "PAID" | "PARTIAL" | "DUE" | "OVERPAID";
    if (totalPaidIncludingCredit.eq(0)) paymentStatus = "DUE";
    else if (totalPaidIncludingCredit.gt(totalAmount)) paymentStatus = "OVERPAID";
    else if (totalPaidIncludingCredit.eq(totalAmount)) paymentStatus = "PAID";
    else paymentStatus = "PARTIAL";

    const saleDate = new Date();

    // Add Sale's own Pay Term Number/Type (pre-filled from the customer, independently editable
    // there) - computed into one concrete due date here, matching the reference's own
    // `sell_due_date` (computed client-side and sent as a plain date there; computed server-side
    // here instead, since this is the one place both saleDate and the pay term are already
    // trustworthy together). Months are calendar months via `setMonth` (handles month-length
    // differences the way `Date` naturally does); days are a flat day count.
    let dueDate: Date | null = null;
    if (input.payTermNumber && input.payTermType) {
      dueDate = new Date(saleDate);
      if (input.payTermType === "MONTHS") dueDate.setMonth(dueDate.getMonth() + input.payTermNumber);
      else dueDate.setDate(dueDate.getDate() + input.payTermNumber);
    }

    // The whole order is "ready" once its slowest service line finishes - not the fastest -
    // so this takes the max hours across service lines, not an average or the first one.
    const serviceHours = lines.map((l) => l.estimatedProcessingHours).filter((h): h is number => h != null);
    const estimatedReadyAt = serviceHours.length > 0 ? new Date(saleDate.getTime() + Math.max(...serviceHours) * 60 * 60 * 1000) : null;

    // --- Quote (asDraft, or a group whose invoiceType is DELIVERY): freeze the priced lines/totals
    // now and stop - no stock deduction, no ZATCA (icv/hash/XML/signature/QR all stay null), no
    // payments, no customer balance change, no loyalty earn/redeem. confirmQuote() runs all of
    // that later against these exact totals, only re-checking that stock is still available.
    // Deliberately simpler than the reference, which re-resolves pricing fresh at confirm time -
    // see docs plan section 7. ---
    if (effectiveAsDraft) {
      // Editing an existing draft (see checkout()'s existingDraftId param comment) - everything
      // above this point (customer/location/VAT checks, per-line pricing, coupon, invoice
      // discount) already ran identically to a fresh create; this branch just writes the result
      // onto the SAME row instead of a new one, preserving its id/quoteNumber/deliveryNumber/
      // isQuotation/createdBy/createdAt exactly as the reference's own edit->update() does (the
      // reference literally reuses the transaction's invoice_no on save, never reissuing it).
      if (existingDraftId) {
        const existing = await tx.sale.findFirst({ where: { id: existingDraftId, organizationId, status: "DRAFT" } });
        if (!existing) throw new NotFoundError("Quote not found");

        await tx.saleItem.deleteMany({ where: { saleId: existing.id } });
        const updatedSale = await tx.sale.update({
          where: { id: existing.id },
          data: {
            businessLocationId: input.businessLocationId,
            customerId: input.customerId,
            estimatedReadyAt,
            saleType,
            subtotal: subtotal.toDecimalPlaces(2),
            discountAmount: discountAmount.toDecimalPlaces(2),
            taxAmount: taxAmount.toDecimalPlaces(2),
            totalAmount: totalAmount.toDecimalPlaces(2),
            dueAmount: totalAmount.toDecimalPlaces(2),
            notes: input.notes,
            invoiceTypeCode: customer.vatNumber?.trim() ? "STANDARD" : "SIMPLIFIED",
            couponId,
            promotionId,
            couponDiscountAmount,
            invoiceDiscountAmount,
            shippingAmount,
            ...buildCustomFieldsData(input.customFields),
            ...buildAdditionalExpensesData(input.additionalExpenses),
            taxExemptionReasonCode: input.taxExemptionReasonCode,
            priceListId,
            payTermNumber: input.payTermNumber,
            payTermType: input.payTermType,
            dueDate,
            documentPath: input.documentPath,
            documentOriginalName: input.documentOriginalName,
          },
        });

        await tx.saleItem.createMany({
          data: lines.map((l) => ({
            saleId: updatedSale.id,
            productId: l.productId,
            serviceId: l.serviceId,
            descriptionEn: l.descriptionEn,
            descriptionAr: l.descriptionAr,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxPercent: l.taxPercent,
            taxAmount: l.taxAmount,
            discountAmount: l.discountAmount,
            subtotal: l.subtotal,
            total: l.total,
            taxCategoryCode: l.taxCategoryCode,
            note: l.note,
            widthM: l.widthM,
            heightM: l.heightM,
            promotionId: l.promotionId,
            discountId: l.discountId,
            couponId: l.couponId,
          })),
        });

        return tx.sale.findUniqueOrThrow({
          where: { id: updatedSale.id },
          include: {
            items: true,
            payments: true,
            customer: { include: { customerGroup: { select: { sendSms: true } } } },
            businessLocation: true,
          },
        });
      }

      // Explicit caller intent always wins; absent that, a DELIVERY-typed customer group's
      // auto-forced draft is a Delivery, not a Quotation - everything else defaults to Quotation
      // (matches every pre-existing caller, which never set this and always meant "quote").
      const isQuotation = input.isQuotation ?? customerGroup?.invoiceType !== "DELIVERY";
      const quoteSaleId = randomUUID();
      const draftDocumentNumber = await claimBusinessLocationNumber(tx, input.businessLocationId, isQuotation ? "quote" : "draft");

      const quoteSale = await tx.sale.create({
        data: {
          id: quoteSaleId,
          organizationId,
          quoteNumber: isQuotation ? draftDocumentNumber : null,
          deliveryNumber: isQuotation ? null : draftDocumentNumber,
          isQuotation,
          invoiceNumber: null,
          businessLocationId: input.businessLocationId,
          customerId: input.customerId,
          customerGroupId: customer.customerGroupId,
          saleDate,
          estimatedReadyAt,
          status: "DRAFT",
          saleType,
          subtotal: subtotal.toDecimalPlaces(2),
          discountAmount: discountAmount.toDecimalPlaces(2),
          taxAmount: taxAmount.toDecimalPlaces(2),
          totalAmount: totalAmount.toDecimalPlaces(2),
          paidAmount: 0,
          dueAmount: totalAmount.toDecimalPlaces(2),
          paymentStatus: "DUE",
          notes: input.notes,
          createdBy,
          icv: null,
          previousInvoiceHash: null,
          invoiceHash: null,
          invoiceTypeCode: customer.vatNumber?.trim() ? "STANDARD" : "SIMPLIFIED",
          couponId,
          promotionId,
          couponDiscountAmount,
          invoiceDiscountAmount,
          shippingAmount,
          ...buildCustomFieldsData(input.customFields),
          ...buildAdditionalExpensesData(input.additionalExpenses),
          taxExemptionReasonCode: input.taxExemptionReasonCode,
          priceListId,
          payTermNumber: input.payTermNumber,
          payTermType: input.payTermType,
          dueDate,
          documentPath: input.documentPath,
          documentOriginalName: input.documentOriginalName,
          channel: input.channel ?? "POS",
        },
      });

      await tx.saleItem.createMany({
        data: lines.map((l) => ({
          saleId: quoteSale.id,
          productId: l.productId,
          serviceId: l.serviceId,
          descriptionEn: l.descriptionEn,
          descriptionAr: l.descriptionAr,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxPercent: l.taxPercent,
          taxAmount: l.taxAmount,
          discountAmount: l.discountAmount,
          subtotal: l.subtotal,
          total: l.total,
          taxCategoryCode: l.taxCategoryCode,
          note: l.note,
          widthM: l.widthM,
          heightM: l.heightM,
          promotionId: l.promotionId,
          discountId: l.discountId,
          couponId: l.couponId,
        })),
      });

      return tx.sale.findUniqueOrThrow({
        where: { id: quoteSale.id },
        include: {
          items: true,
          payments: true,
          customer: { include: { customerGroup: { select: { sendSms: true } } } },
          businessLocation: true,
        },
      });
    }

    const codes = await paymentCodes(tx, input.payments);
    await assertPromotionPaymentRules(tx, organizationId, appliedPromotion?.promotion ?? null, input.payments, codes, totalAmount, appliedCreditAmount);

    const invoiceNumber = await claimBusinessLocationNumber(tx, input.businessLocationId, "invoice");
    // Generated up front (rather than left to Prisma's default) because the XML's cbc:UUID
    // must equal the Sale's own id, and the XML has to be built - and hashed, and signed -
    // before the row exists.
    const saleId = randomUUID();

    // B2B (buyer has a VAT number) -> Standard Tax Invoice, needs Clearance (Phase D).
    // Everything else (walk-in / individual) -> Simplified Tax Invoice, needs Reporting.
    const invoiceTypeCode = customer.vatNumber?.trim() ? "STANDARD" : "SIMPLIFIED";

    // Atomically claim the next ICV for this location - the UPDATE takes a row lock, so
    // concurrent checkouts against the same location serialize here instead of colliding.
    const updatedLocation = await tx.businessLocation.update({
      where: { id: input.businessLocationId },
      data: { lastIcv: { increment: 1 } },
    });
    const icv = updatedLocation.lastIcv;

    const previousSale = await tx.sale.findFirst({
      where: { businessLocationId: input.businessLocationId },
      orderBy: { icv: "desc" },
      select: { invoiceHash: true },
    });
    const previousInvoiceHash = previousSale?.invoiceHash ?? GENESIS_PREVIOUS_HASH;

    // Phase C: if this location has a signing key, produce a real UBL XML + ECDSA signature +
    // 8-field QR. Otherwise fall back to Phase A/B's JSON-hash + 5-field QR - no regression for
    // locations that haven't been onboarded yet (see docs/POS-ZATCA-PLAN.md).
    const certificate = await tx.zatcaDeviceCertificate.findUnique({ where: { businessLocationId: input.businessLocationId } });
    const localTime = toLocationLocalParts(saleDate, businessLocation.timezone);
    const localTimestampIso = `${localTime.dateIso}T${localTime.timeIso}`;

    let invoiceHash: string;
    let qrCodeBase64: string;
    let xmlContent: string | undefined;
    let digitalSignature: string | undefined;
    let publicKeyPem: string | undefined;

    if (certificate) {
      const paymentMeansCodes = await resolvePaymentMeansCodes(tx, input.payments);
      const ublLines: UblInvoiceLine[] = lines.map((l, index) => ({
        id: index + 1,
        descriptionEn: l.descriptionEn,
        quantity: l.quantity.toString(),
        unitPrice: l.unitPrice.toDecimalPlaces(2).toString(),
        taxPercent: l.taxPercent.toDecimalPlaces(2).toString(),
        taxCategoryCode: l.taxCategoryCode,
        lineSubtotal: l.subtotal.toString(),
        lineTax: l.taxAmount.toString(),
        lineTotal: l.total.toString(),
        ...(input.taxExemptionReasonCode && (l.taxCategoryCode === "E" || l.taxCategoryCode === "Z")
          ? {
              taxExemptionReasonCode: input.taxExemptionReasonCode,
              taxExemptionReason: TAX_EXEMPTION_REASONS[input.taxExemptionReasonCode]?.en,
            }
          : {}),
      }));

      xmlContent = buildInvoiceXml({
        invoiceId: invoiceNumber,
        uuid: saleId,
        icv,
        previousInvoiceHash,
        issueDateIso: localTime.dateIso,
        issueTimeIso: localTime.timeIso,
        invoiceTypeCode,
        currency: businessLocation.currency,
        seller: {
          nameEn: businessLocation.businessNameEn,
          vatNumber: businessLocation.vatNumber,
          crNumber: businessLocation.crNumber,
          city: businessLocation.city,
          address: businessLocation.address,
          district: businessLocation.district,
          postalCode: businessLocation.postalCode,
          buildingNo: businessLocation.buildingNo,
        },
        buyer: { name: customer.nameEn, vatNumber: customer.vatNumber },
        lines: ublLines,
        subtotal: subtotal.toDecimalPlaces(2).toString(),
        discountAmount: discountAmount.toDecimalPlaces(2).toString(),
        taxAmount: taxAmount.toDecimalPlaces(2).toString(),
        totalAmount: totalAmount.toDecimalPlaces(2).toString(),
        chargeAmount: additionalExpensesTotal.toDecimalPlaces(2).toString(),
        paymentMeansCodes,
      });

      invoiceHash = computeXmlInvoiceHash(xmlContent);
      const privateKeyPem = decryptSecret(certificate.privateKeyEncrypted);
      digitalSignature = signInvoiceXml(xmlContent, privateKeyPem);
      publicKeyPem = certificate.publicKeyPem;

      qrCodeBase64 = buildSignedQrTlvBase64({
        sellerName: businessLocation.businessNameAr,
        vatNumber: businessLocation.vatNumber,
        timestampIso: localTimestampIso,
        invoiceTotal: totalAmount.toDecimalPlaces(2).toString(),
        vatTotal: taxAmount.toDecimalPlaces(2).toString(),
        invoiceHashBase64: invoiceHash,
        signatureBase64: digitalSignature,
        publicKeyPem,
      });
    } else {
      invoiceHash = computeInvoiceHash(previousInvoiceHash, {
        businessLocationId: input.businessLocationId,
        icv,
        invoiceTypeCode,
        transactionTypeCode: "INVOICE",
        invoiceNumber,
        saleDateIso: saleDate.toISOString(),
        subtotal: subtotal.toDecimalPlaces(2).toString(),
        taxAmount: taxAmount.toDecimalPlaces(2).toString(),
        totalAmount: totalAmount.toDecimalPlaces(2).toString(),
        items: lines.map((l) => ({
          description: l.descriptionEn,
          quantity: l.quantity.toString(),
          unitPrice: l.unitPrice.toString(),
          taxAmount: l.taxAmount.toString(),
          total: l.total.toString(),
        })),
      });

      qrCodeBase64 = buildQrTlvBase64({
        sellerName: businessLocation.businessNameAr,
        vatNumber: businessLocation.vatNumber,
        timestampIso: localTimestampIso,
        invoiceTotal: totalAmount.toDecimalPlaces(2).toString(),
        vatTotal: taxAmount.toDecimalPlaces(2).toString(),
      });
    }

    const sale = await tx.sale.create({
      data: {
        id: saleId,
        organizationId,
        invoiceNumber,
        businessLocationId: input.businessLocationId,
        customerId: input.customerId,
        customerGroupId: customer.customerGroupId,
        saleDate,
        estimatedReadyAt,
        saleType,
        subtotal: subtotal.toDecimalPlaces(2),
        discountAmount: discountAmount.toDecimalPlaces(2),
        taxAmount: taxAmount.toDecimalPlaces(2),
        totalAmount: totalAmount.toDecimalPlaces(2),
        paidAmount: totalPaidIncludingCredit.toDecimalPlaces(2),
        dueAmount: dueAmount.toDecimalPlaces(2),
        paymentStatus,
        notes: input.notes,
        createdBy,
        icv,
        previousInvoiceHash,
        invoiceHash,
        invoiceTypeCode,
        qrCodeBase64,
        xmlContent,
        digitalSignature,
        publicKeyPem,
        registerSessionId: openRegisterSession?.id,
        couponId,
        promotionId,
        couponDiscountAmount,
        invoiceDiscountAmount,
        shippingAmount,
        ...buildCustomFieldsData(input.customFields),
        ...buildAdditionalExpensesData(input.additionalExpenses),
        taxExemptionReasonCode: input.taxExemptionReasonCode,
        priceListId,
        payTermNumber: input.payTermNumber,
        payTermType: input.payTermType,
        dueDate,
        documentPath: input.documentPath,
        documentOriginalName: input.documentOriginalName,
        channel: input.channel ?? "POS",
      },
    });

    await tx.saleItem.createMany({
      data: lines.map((l) => ({
        saleId: sale.id,
        productId: l.productId,
        serviceId: l.serviceId,
        descriptionEn: l.descriptionEn,
        descriptionAr: l.descriptionAr,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxPercent: l.taxPercent,
        taxAmount: l.taxAmount,
        discountAmount: l.discountAmount,
        subtotal: l.subtotal,
        total: l.total,
        taxCategoryCode: l.taxCategoryCode,
        note: l.note,
        widthM: l.widthM,
        heightM: l.heightM,
        promotionId: l.promotionId,
        discountId: l.discountId,
        couponId: l.couponId,
      })),
    });

    // Stock deduction for product lines that track inventory.
    for (const line of lines) {
      if (!line.productId || !line.manageStock) continue;

      const stock = await tx.productStock.findUnique({
        where: { productId_businessLocationId: { productId: line.productId, businessLocationId: input.businessLocationId } },
      });
      const currentQty = stock?.quantity ?? new Decimal(0);
      const newQty = currentQty.sub(line.quantity);
      if (newQty.lt(0)) {
        throw new AppError(400, `Insufficient stock for "${line.descriptionEn}" (available: ${currentQty}, requested: ${line.quantity})`);
      }

      await tx.productStock.upsert({
        where: { productId_businessLocationId: { productId: line.productId, businessLocationId: input.businessLocationId } },
        update: { quantity: newQty },
        create: { productId: line.productId, businessLocationId: input.businessLocationId, quantity: newQty },
      });

      await tx.inventoryTransaction.create({
        data: {
          productId: line.productId,
          businessLocationId: input.businessLocationId,
          type: "SALE",
          quantity: line.quantity.neg(),
          balanceAfter: newQty,
          referenceType: "SALE",
          referenceId: sale.id,
          createdBy,
        },
      });
    }

    if (appliedCreditAmount.gt(0)) {
      const storeCreditMethod = await tx.paymentMethod.findFirst({ where: { organizationId, code: "STORE_CREDIT" } });
      if (!storeCreditMethod) throw new AppError(500, "Store credit payment method is not configured for this organization");
      const storeCreditPayment = await tx.payment.create({
        data: {
          saleId: sale.id,
          customerId: input.customerId,
          businessLocationId: input.businessLocationId,
          amount: appliedCreditAmount.toDecimalPlaces(2),
          paymentMethodId: storeCreditMethod.id,
          type: "SALE_PAYMENT",
          createdBy,
        },
      });
      await finalizeNewPayments(tx, [storeCreditPayment.id]);
    }

    if (input.payments.length > 0) {
      const createdPaymentIds: string[] = [];
      for (const p of input.payments) {
        const created = await tx.payment.create({
          data: {
            saleId: sale.id,
            customerId: input.customerId,
            businessLocationId: input.businessLocationId,
            amount: p.amount,
            paymentMethodId: p.paymentMethodId,
            type: "SALE_PAYMENT",
            referenceNumber: p.referenceNumber,
            notes: p.notes,
            createdBy,
          },
        });
        createdPaymentIds.push(created.id);
      }
      await finalizeNewPayments(tx, createdPaymentIds);

      const methods = await tx.paymentMethod.findMany({
        where: { id: { in: input.payments.map((p) => p.paymentMethodId) } },
        select: { id: true, code: true },
      });
      const codeById = new Map(methods.map((m) => [m.id, m.code]));

      // Cashback (P8-2) is a distinct customer balance from store credit/loyalty points - the
      // cashier explicitly picks it as a payment tender (like Cash/Card), so it rides the same
      // input.payments array and just needs its own balance-deduction side effect here.
      // adjustCashbackTx throws if this would overdraw the balance, so no separate clamp needed.
      const cashbackPayments = input.payments.filter((p) => codeById.get(p.paymentMethodId) === "CASHBACK");
      if (cashbackPayments.length > 0) {
        const totalCashback = cashbackPayments.reduce((sum, p) => sum.add(new Decimal(p.amount)), new Decimal(0));
        await adjustCashbackTx(tx, input.customerId, totalCashback.neg(), "REDEEM", `Redeemed on ${invoiceNumber}`, organizationId, createdBy, { saleId: sale.id });
      }

      if (openRegisterSession) {
        const cashPayments = input.payments.filter((p) => codeById.get(p.paymentMethodId) === "CASH");
        if (cashPayments.length > 0) {
          await tx.registerTransaction.createMany({
            data: cashPayments.map((p) => ({
              registerSessionId: openRegisterSession.id,
              type: "CREDIT" as const,
              amount: p.amount,
              paymentMethod: "CASH",
              referenceType: "SALE_PAYMENT",
              referenceId: sale.id,
            })),
          });
        }
      }

      // BNPL (Tier 4) rides input.payments the same way CASHBACK/CASH do - the frontend puts the
      // captured BnplSession's id in referenceNumber. verifyAndConsumeSessionTx re-checks status,
      // amount, expiry, and single-use against the database row inside this same transaction
      // rather than trusting the client's belief that the session is good.
      const bnplPayments = input.payments.filter((p) => BNPL_PAYMENT_CODES.includes(codeById.get(p.paymentMethodId) ?? ""));
      for (const p of bnplPayments) {
        if (!p.referenceNumber) throw new AppError(400, "A BNPL payment must reference its session id");
        await verifyAndConsumeSessionTx(tx, p.referenceNumber, sale.id, p.amount, organizationId);
      }
    }

    if (appliedPromotion) {
      await grantPromotionCashback(tx, {
        promotion: appliedPromotion.promotion,
        customerId: input.customerId,
        saleId: sale.id,
        invoiceNumber,
        totalAmount,
        payments: input.payments,
        codes,
        organizationId,
        createdBy,
      });
    }

    // Customer balance reflects what they still owe (or, if negative, a credit from overpayment).
    // Loyalty points redeemed/earned on this sale net into the same balance update.
    const pointsNetChange = pointsEarned - redeemedPoints;
    await tx.customer.update({
      where: { id: input.customerId },
      data: { balance: { increment: dueBeforeCredit.toDecimalPlaces(2) }, rewardPoints: { increment: pointsNetChange } },
    });

    let runningPointsBalance = customer.rewardPoints;
    if (redeemedPoints > 0) {
      runningPointsBalance -= redeemedPoints;
      await tx.loyaltyTransaction.create({
        data: {
          organizationId,
          customerId: input.customerId,
          saleId: sale.id,
          type: "REDEEM",
          points: -redeemedPoints,
          balanceAfter: runningPointsBalance,
          note: `Redeemed on ${invoiceNumber}`,
          createdBy,
        },
      });
    }
    if (pointsEarned > 0) {
      runningPointsBalance += pointsEarned;
      await tx.loyaltyTransaction.create({
        data: {
          organizationId,
          customerId: input.customerId,
          saleId: sale.id,
          type: "EARN",
          points: pointsEarned,
          balanceAfter: runningPointsBalance,
          note: `Earned on ${invoiceNumber}`,
          createdBy,
        },
      });
    }

    return tx.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: {
        items: true,
        payments: { include: { paymentMethod: true } },
        customer: { include: { customerGroup: { select: { sendSms: true } } } },
        businessLocation: true,
      },
    });
  });

  // Fired after commit, never inside the transaction - an SMS failure must never roll back a real
  // sale. Guarded on FINAL so saving a quote (asDraft) never fires a "new sale"/"payment received"
  // text - nothing was actually sold yet. Also guarded on the customer's group's own `sendSms` flag
  // (EJADA reference's send_sms checkbox) - defaults to true when the customer has no group, so
  // this doesn't go quiet for the common ungrouped case.
  if (sale.status === "FINAL" && sale.customer.phone && sale.customer.customerGroup?.sendSms !== false) {
    await sendTemplatedSms(
      organizationId,
      "NEW_SALE",
      sale.customer.phone,
      { customerName: sale.customer.nameEn, invoiceNumber: sale.invoiceNumber ?? "", amount: sale.totalAmount.toFixed(2) },
      "SALE",
      sale.id,
    );
    if (new Decimal(sale.paidAmount).gt(0)) {
      await sendTemplatedSms(
        organizationId,
        "PAYMENT_RECEIVED",
        sale.customer.phone,
        { invoiceNumber: sale.invoiceNumber ?? "", amount: sale.paidAmount.toString() },
        "SALE",
        sale.id,
      );
    }
  }

  return sale;
}

// --- Quotes: confirm / void / list ---------------------------------------------------------
// A quote is a DRAFT Sale (see checkout()'s asDraft branch above) - confirming it runs the same
// ZATCA/stock/payment/loyalty pipeline checkout() runs for a normal sale, just against the
// quote's already-priced SaleItem rows instead of fresh cart input, and updates the SAME Sale row
// to FINAL rather than creating a new one (preserving full quote->invoice traceability).

export async function confirmQuote(saleId: string, input: ConfirmQuoteInput, organizationId: string, createdBy: string) {
  const sale = await prisma.$transaction(async (tx) => {
    const draft = await tx.sale.findFirst({
      where: { id: saleId, organizationId, status: "DRAFT" },
      include: { items: true, customer: true, businessLocation: true },
    });
    if (!draft) throw new NotFoundError("Quote not found");

    // Bound to local consts (rather than read repeatedly off `draft.customer`/`draft.businessLocation`)
    // so the checks below narrow them from nullable to definitely-present for the rest of this
    // function - same requirement checkout() enforces, re-checked here in case either changed
    // since the quote was first created.
    const customer = draft.customer;
    const businessLocation = draft.businessLocation;
    if (!customer.nameAr?.trim()) {
      throw new ValidationError(
        [{ field: "customerId", message: "Customer needs an Arabic name before an invoice can be issued (ZATCA requirement)" }],
        "Customer is missing required Arabic name",
      );
    }
    if (!businessLocation.vatNumber?.trim()) {
      throw new ValidationError(
        [{ field: "businessLocationId", message: "This business location has no VAT number configured (ZATCA requirement)" }],
        "Business location is missing a VAT number",
      );
    }

    // Price stays exactly as quoted - only stock availability is re-checked, since it's the one
    // thing that can genuinely have changed since the quote was priced (see docs plan section 7).
    for (const item of draft.items) {
      if (!item.productId) continue;
      const product = await tx.product.findFirst({ where: { id: item.productId, organizationId, deletedAt: null } });
      if (!product?.manageStock) continue;
      const stock = await tx.productStock.findUnique({
        where: { productId_businessLocationId: { productId: item.productId, businessLocationId: draft.businessLocationId } },
      });
      const currentQty = stock?.quantity ?? new Decimal(0);
      if (currentQty.lt(item.quantity)) {
        throw new AppError(400, `Insufficient stock for "${item.descriptionEn}" (available: ${currentQty}, requested: ${item.quantity})`);
      }
    }

    // Same customer-group monthly cap enforcement as checkout() - a quote (including one created
    // as a DRAFT by default because its group's invoiceType is DELIVERY) never counted against the
    // cap while it sat as a draft; this is the point it becomes a real FINAL sale, so it's checked
    // here instead, against the same combined-group-or-per-customer scope (maxFor).
    if (customer.customerGroupId) {
      const group = await tx.customerGroup.findUnique({ where: { id: customer.customerGroupId } });
      if (group && (group.maxAmountPerMonth != null || group.maxInvoicesPerMonth != null || group.maxQtyPerMonth != null)) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const monthWhere: Prisma.SaleWhereInput = {
          organizationId,
          status: "FINAL",
          saleDate: { gte: monthStart, lt: monthEnd },
          ...(group.maxFor === "CUSTOMER" ? { customerId: customer.id } : { customer: { customerGroupId: group.id } }),
        };

        if (group.maxAmountPerMonth != null) {
          const existing = await tx.sale.aggregate({ where: monthWhere, _sum: { totalAmount: true } });
          const existingAmount = existing._sum.totalAmount ?? new Decimal(0);
          if (existingAmount.add(draft.totalAmount).gt(group.maxAmountPerMonth)) {
            throw new AppError(400, `This customer group's monthly spend cap of ${group.maxAmountPerMonth.toFixed(2)} would be exceeded`);
          }
        }
        if (group.maxInvoicesPerMonth != null) {
          const existingCount = await tx.sale.count({ where: monthWhere });
          if (existingCount + 1 > group.maxInvoicesPerMonth) {
            throw new AppError(400, `This customer group's monthly invoice cap of ${group.maxInvoicesPerMonth} would be exceeded`);
          }
        }
        if (group.maxQtyPerMonth != null) {
          const qtyAgg = await tx.saleItem.aggregate({ where: { sale: monthWhere }, _sum: { quantity: true } });
          const existingQty = qtyAgg._sum.quantity ?? new Decimal(0);
          const thisQty = draft.items.reduce((sum, l) => sum.add(l.quantity), new Decimal(0));
          if (existingQty.add(thisQty).gt(group.maxQtyPerMonth)) {
            throw new AppError(400, `This customer group's monthly quantity cap of ${group.maxQtyPerMonth.toString()} would be exceeded`);
          }
        }
      }
    }

    const org = await tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { rewardPointsEnabled: true, pointsEarnDivisor: true, minOrderForPoints: true, maxPointsPerOrder: true },
    });
    const openRegisterSession = await tx.registerSession.findFirst({
      where: { businessLocationId: draft.businessLocationId, organizationId, status: "OPEN" },
      select: { id: true },
    });

    const totalAmount = draft.totalAmount;
    const paidAmount = input.payments.reduce((sum, p) => sum.add(new Decimal(p.amount)), new Decimal(0));
    const dueBeforeCredit = totalAmount.sub(paidAmount);

    // Same credit-application math as checkout() - see the comment there.
    const availableCredit = customer.balance.lt(0) ? customer.balance.neg() : new Decimal(0);
    const requestedCredit = new Decimal(input.appliedCreditAmount ?? 0);
    const maxApplicableCredit = Decimal.max(Decimal.min(dueBeforeCredit, availableCredit), 0);
    if (requestedCredit.gt(maxApplicableCredit)) {
      throw new AppError(400, `Applied credit cannot exceed ${maxApplicableCredit.toFixed(2)} (due: ${dueBeforeCredit.toFixed(2)}, available credit: ${availableCredit.toFixed(2)})`);
    }
    const appliedCreditAmount = requestedCredit;
    const dueAmount = dueBeforeCredit.sub(appliedCreditAmount);
    const totalPaidIncludingCredit = paidAmount.add(appliedCreditAmount);

    let paymentStatus: "PAID" | "PARTIAL" | "DUE" | "OVERPAID";
    if (totalPaidIncludingCredit.eq(0)) paymentStatus = "DUE";
    else if (totalPaidIncludingCredit.gt(totalAmount)) paymentStatus = "OVERPAID";
    else if (totalPaidIncludingCredit.eq(totalAmount)) paymentStatus = "PAID";
    else paymentStatus = "PARTIAL";

    // Earning is computed fresh here (using this moment's org settings and the quote's locked
    // total) since nothing was ever earned on the draft. Redemption isn't offered on quotes at
    // all - see the comment on redeemedPoints in checkout().
    let pointsEarned = 0;
    if (org.rewardPointsEnabled && totalAmount.gte(org.minOrderForPoints)) {
      pointsEarned = Math.floor(totalAmount.div(org.pointsEarnDivisor).toNumber());
      if (org.maxPointsPerOrder != null) pointsEarned = Math.min(pointsEarned, org.maxPointsPerOrder);
    }

    // The promotion was applied (and its discounts frozen) when the quote was saved - its payment
    // rules and cash back still apply now that it becomes a real invoice.
    const quotePromotion = draft.promotionId ? await tx.promotion.findFirst({ where: { id: draft.promotionId, deletedAt: null } }) : null;
    const codes = await paymentCodes(tx, input.payments);
    await assertPromotionPaymentRules(tx, organizationId, quotePromotion, input.payments, codes, totalAmount, appliedCreditAmount);

    const invoiceNumber = await claimBusinessLocationNumber(tx, draft.businessLocationId, "invoice");
    const saleDate = new Date();
    const invoiceTypeCode = customer.vatNumber?.trim() ? "STANDARD" : "SIMPLIFIED";

    const updatedLocation = await tx.businessLocation.update({
      where: { id: draft.businessLocationId },
      data: { lastIcv: { increment: 1 } },
    });
    const icv = updatedLocation.lastIcv;

    const previousSale = await tx.sale.findFirst({
      where: { businessLocationId: draft.businessLocationId, icv: { not: null } },
      orderBy: { icv: "desc" },
      select: { invoiceHash: true },
    });
    const previousInvoiceHash = previousSale?.invoiceHash ?? GENESIS_PREVIOUS_HASH;

    const certificate = await tx.zatcaDeviceCertificate.findUnique({ where: { businessLocationId: draft.businessLocationId } });
    const localTime = toLocationLocalParts(saleDate, businessLocation.timezone);
    const localTimestampIso = `${localTime.dateIso}T${localTime.timeIso}`;

    let invoiceHash: string;
    let qrCodeBase64: string;
    let xmlContent: string | undefined;
    let digitalSignature: string | undefined;
    let publicKeyPem: string | undefined;

    if (certificate) {
      const paymentMeansCodes = await resolvePaymentMeansCodes(tx, input.payments);
      const ublLines: UblInvoiceLine[] = draft.items.map((l, index) => ({
        id: index + 1,
        descriptionEn: l.descriptionEn,
        quantity: l.quantity.toString(),
        unitPrice: l.unitPrice.toDecimalPlaces(2).toString(),
        taxPercent: l.taxPercent.toDecimalPlaces(2).toString(),
        taxCategoryCode: l.taxCategoryCode,
        lineSubtotal: l.subtotal.toString(),
        lineTax: l.taxAmount.toString(),
        lineTotal: l.total.toString(),
        ...(draft.taxExemptionReasonCode && (l.taxCategoryCode === "E" || l.taxCategoryCode === "Z")
          ? {
              taxExemptionReasonCode: draft.taxExemptionReasonCode,
              taxExemptionReason: TAX_EXEMPTION_REASONS[draft.taxExemptionReasonCode]?.en,
            }
          : {}),
      }));

      xmlContent = buildInvoiceXml({
        invoiceId: invoiceNumber,
        uuid: draft.id,
        icv,
        previousInvoiceHash,
        issueDateIso: localTime.dateIso,
        issueTimeIso: localTime.timeIso,
        invoiceTypeCode,
        currency: businessLocation.currency,
        seller: {
          nameEn: businessLocation.businessNameEn,
          vatNumber: businessLocation.vatNumber,
          crNumber: businessLocation.crNumber,
          city: businessLocation.city,
          address: businessLocation.address,
          district: businessLocation.district,
          postalCode: businessLocation.postalCode,
          buildingNo: businessLocation.buildingNo,
        },
        buyer: { name: customer.nameEn, vatNumber: customer.vatNumber },
        lines: ublLines,
        subtotal: draft.subtotal.toString(),
        discountAmount: draft.discountAmount.toString(),
        taxAmount: draft.taxAmount.toString(),
        totalAmount: draft.totalAmount.toString(),
        chargeAmount: draft.additionalExpense1Value
          .add(draft.additionalExpense2Value)
          .add(draft.additionalExpense3Value)
          .add(draft.additionalExpense4Value)
          .toDecimalPlaces(2)
          .toString(),
        paymentMeansCodes,
      });

      invoiceHash = computeXmlInvoiceHash(xmlContent);
      const privateKeyPem = decryptSecret(certificate.privateKeyEncrypted);
      digitalSignature = signInvoiceXml(xmlContent, privateKeyPem);
      publicKeyPem = certificate.publicKeyPem;

      qrCodeBase64 = buildSignedQrTlvBase64({
        sellerName: businessLocation.businessNameAr,
        vatNumber: businessLocation.vatNumber,
        timestampIso: localTimestampIso,
        invoiceTotal: draft.totalAmount.toString(),
        vatTotal: draft.taxAmount.toString(),
        invoiceHashBase64: invoiceHash,
        signatureBase64: digitalSignature,
        publicKeyPem,
      });
    } else {
      invoiceHash = computeInvoiceHash(previousInvoiceHash, {
        businessLocationId: draft.businessLocationId,
        icv,
        invoiceTypeCode,
        transactionTypeCode: "INVOICE",
        invoiceNumber,
        saleDateIso: saleDate.toISOString(),
        subtotal: draft.subtotal.toString(),
        taxAmount: draft.taxAmount.toString(),
        totalAmount: draft.totalAmount.toString(),
        items: draft.items.map((l) => ({
          description: l.descriptionEn,
          quantity: l.quantity.toString(),
          unitPrice: l.unitPrice.toString(),
          taxAmount: l.taxAmount.toString(),
          total: l.total.toString(),
        })),
      });

      qrCodeBase64 = buildQrTlvBase64({
        sellerName: businessLocation.businessNameAr,
        vatNumber: businessLocation.vatNumber,
        timestampIso: localTimestampIso,
        invoiceTotal: draft.totalAmount.toString(),
        vatTotal: draft.taxAmount.toString(),
      });
    }

    await tx.sale.update({
      where: { id: draft.id },
      data: {
        status: "FINAL",
        invoiceNumber,
        saleDate,
        paidAmount: totalPaidIncludingCredit.toDecimalPlaces(2),
        dueAmount: dueAmount.toDecimalPlaces(2),
        paymentStatus,
        icv,
        previousInvoiceHash,
        invoiceHash,
        invoiceTypeCode,
        qrCodeBase64,
        xmlContent,
        digitalSignature,
        publicKeyPem,
        registerSessionId: openRegisterSession?.id,
      },
    });

    // Stock deduction for product lines that track inventory - mirrors checkout()'s block exactly.
    for (const item of draft.items) {
      if (!item.productId) continue;
      const product = await tx.product.findFirst({ where: { id: item.productId, organizationId, deletedAt: null } });
      if (!product?.manageStock) continue;

      const stock = await tx.productStock.findUnique({
        where: { productId_businessLocationId: { productId: item.productId, businessLocationId: draft.businessLocationId } },
      });
      const currentQty = stock?.quantity ?? new Decimal(0);
      const newQty = currentQty.sub(item.quantity);
      if (newQty.lt(0)) {
        throw new AppError(400, `Insufficient stock for "${item.descriptionEn}" (available: ${currentQty}, requested: ${item.quantity})`);
      }

      await tx.productStock.upsert({
        where: { productId_businessLocationId: { productId: item.productId, businessLocationId: draft.businessLocationId } },
        update: { quantity: newQty },
        create: { productId: item.productId, businessLocationId: draft.businessLocationId, quantity: newQty },
      });

      await tx.inventoryTransaction.create({
        data: {
          productId: item.productId,
          businessLocationId: draft.businessLocationId,
          type: "SALE",
          quantity: item.quantity.neg(),
          balanceAfter: newQty,
          referenceType: "SALE",
          referenceId: draft.id,
          createdBy,
        },
      });
    }

    if (appliedCreditAmount.gt(0)) {
      const storeCreditMethod = await tx.paymentMethod.findFirst({ where: { organizationId, code: "STORE_CREDIT" } });
      if (!storeCreditMethod) throw new AppError(500, "Store credit payment method is not configured for this organization");
      const storeCreditPayment = await tx.payment.create({
        data: {
          saleId: draft.id,
          customerId: draft.customerId,
          businessLocationId: draft.businessLocationId,
          amount: appliedCreditAmount.toDecimalPlaces(2),
          paymentMethodId: storeCreditMethod.id,
          type: "SALE_PAYMENT",
          createdBy,
        },
      });
      await finalizeNewPayments(tx, [storeCreditPayment.id]);
    }

    if (input.payments.length > 0) {
      const createdPaymentIds: string[] = [];
      for (const p of input.payments) {
        const created = await tx.payment.create({
          data: {
            saleId: draft.id,
            customerId: draft.customerId,
            businessLocationId: draft.businessLocationId,
            amount: p.amount,
            paymentMethodId: p.paymentMethodId,
            type: "SALE_PAYMENT",
            referenceNumber: p.referenceNumber,
            notes: p.notes,
            createdBy,
          },
        });
        createdPaymentIds.push(created.id);
      }
      await finalizeNewPayments(tx, createdPaymentIds);

      const methods = await tx.paymentMethod.findMany({
        where: { id: { in: input.payments.map((p) => p.paymentMethodId) } },
        select: { id: true, code: true },
      });
      const codeById = new Map(methods.map((m) => [m.id, m.code]));

      // See the identical comment in checkout() - cashback rides input.payments like any other
      // tender and just needs its own balance-deduction side effect here.
      const cashbackPayments = input.payments.filter((p) => codeById.get(p.paymentMethodId) === "CASHBACK");
      if (cashbackPayments.length > 0) {
        const totalCashback = cashbackPayments.reduce((sum, p) => sum.add(new Decimal(p.amount)), new Decimal(0));
        await adjustCashbackTx(tx, draft.customerId, totalCashback.neg(), "REDEEM", `Redeemed on ${invoiceNumber}`, organizationId, createdBy, { saleId: draft.id });
      }

      if (openRegisterSession) {
        const cashPayments = input.payments.filter((p) => codeById.get(p.paymentMethodId) === "CASH");
        if (cashPayments.length > 0) {
          await tx.registerTransaction.createMany({
            data: cashPayments.map((p) => ({
              registerSessionId: openRegisterSession.id,
              type: "CREDIT" as const,
              amount: p.amount,
              paymentMethod: "CASH",
              referenceType: "SALE_PAYMENT",
              referenceId: draft.id,
            })),
          });
        }
      }

      // See the identical comment in checkout() - BNPL sessions are verified and consumed here too.
      const bnplPayments = input.payments.filter((p) => BNPL_PAYMENT_CODES.includes(codeById.get(p.paymentMethodId) ?? ""));
      for (const p of bnplPayments) {
        if (!p.referenceNumber) throw new AppError(400, "A BNPL payment must reference its session id");
        await verifyAndConsumeSessionTx(tx, p.referenceNumber, draft.id, p.amount, organizationId);
      }
    }

    if (quotePromotion) {
      await grantPromotionCashback(tx, {
        promotion: quotePromotion,
        customerId: draft.customerId,
        saleId: draft.id,
        invoiceNumber,
        totalAmount,
        payments: input.payments,
        codes,
        organizationId,
        createdBy,
      });
    }

    await tx.customer.update({
      where: { id: draft.customerId },
      data: { balance: { increment: dueBeforeCredit.toDecimalPlaces(2) }, rewardPoints: { increment: pointsEarned } },
    });

    if (pointsEarned > 0) {
      const runningPointsBalance = draft.customer.rewardPoints + pointsEarned;
      await tx.loyaltyTransaction.create({
        data: {
          organizationId,
          customerId: draft.customerId,
          saleId: draft.id,
          type: "EARN",
          points: pointsEarned,
          balanceAfter: runningPointsBalance,
          note: `Earned on ${invoiceNumber}`,
          createdBy,
        },
      });
    }

    // The coupon's usedCount was deliberately NOT incremented at quote-creation time (see
    // checkout()'s asDraft branch) - this is the first point a coupon on a quote actually "uses"
    // a redemption slot.
    if (draft.couponId) {
      await tx.coupon.update({ where: { id: draft.couponId }, data: { usedCount: { increment: 1 } } });
    }

    return tx.sale.findUniqueOrThrow({
      where: { id: draft.id },
      include: {
        items: true,
        payments: { include: { paymentMethod: true } },
        customer: { include: { customerGroup: { select: { sendSms: true } } } },
        businessLocation: true,
      },
    });
  });

  // Same post-commit trigger pair as checkout() - a confirmed quote is the first moment it
  // becomes a real invoice, so it gets the same NEW_SALE/PAYMENT_RECEIVED texts a direct sale would.
  // Same customer-group sendSms gate as checkout() too.
  if (sale.customer.phone && sale.customer.customerGroup?.sendSms !== false) {
    await sendTemplatedSms(
      organizationId,
      "NEW_SALE",
      sale.customer.phone,
      { customerName: sale.customer.nameEn, invoiceNumber: sale.invoiceNumber ?? "", amount: sale.totalAmount.toFixed(2) },
      "SALE",
      sale.id,
    );
    if (new Decimal(sale.paidAmount).gt(0)) {
      await sendTemplatedSms(
        organizationId,
        "PAYMENT_RECEIVED",
        sale.customer.phone,
        { invoiceNumber: sale.invoiceNumber ?? "", amount: sale.paidAmount.toString() },
        "SALE",
        sale.id,
      );
    }
  }

  return sale;
}

export async function voidQuote(saleId: string, organizationId: string) {
  const draft = await prisma.sale.findFirst({ where: { id: saleId, organizationId, status: "DRAFT" } });
  if (!draft) throw new NotFoundError("Quote not found");
  // Nothing to reverse - a DRAFT never touched stock, money, or points (see checkout()'s asDraft
  // branch and the coupon-usage note above).
  return prisma.sale.update({ where: { id: draft.id }, data: { status: "CANCELLED" } });
}

// Reference's own action-dropdown "Delete" (SellPosController@destroy -> TransactionUtil::
// deleteSale()) - a genuine hard delete, distinct from voidQuote() above (this app's own
// soft-cancel-for-an-audit-trail addition, which the reference dropdown doesn't actually have).
// Reference's deleteSale() only reverses stock/payments/points on a FINAL sale being deleted - for
// a DRAFT (all this list ever shows) it's confirmed to be a straight row delete with no side
// effects, since a draft never touched stock, money, or points. Scoped to status=DRAFT so a
// CANCELLED (voided) or FINAL row can never be reached through this path.
export async function deleteQuote(saleId: string, organizationId: string) {
  const draft = await prisma.sale.findFirst({ where: { id: saleId, organizationId, status: "DRAFT" } });
  if (!draft) throw new NotFoundError("Quote not found");
  await prisma.sale.delete({ where: { id: draft.id } });
}

// Reference's action-dropdown "View Quote URL" (quotation-only) - Util::getInvoiceUrl()'s lazy
// generate-and-persist-once pattern: the token never changes once issued, so a link already
// shared/printed/texted to a customer keeps working. 24 random bytes (48 hex chars) rather than
// the reference's weak md5(rand()+microtime()) - this app has no reason to keep that weakness.
export async function getOrCreateShareToken(saleId: string, organizationId: string): Promise<string> {
  const sale = await prisma.sale.findFirst({ where: { id: saleId, organizationId }, select: { publicToken: true } });
  if (!sale) throw new NotFoundError("Quote not found");
  if (sale.publicToken) return sale.publicToken;
  const token = randomBytes(24).toString("hex");
  await prisma.sale.update({ where: { id: saleId }, data: { publicToken: token } });
  return token;
}

// Backs the public /q/:token page (mounted before the auth gate, see routes/index.ts) - anyone
// with the link can view it, no login, matching the reference's own public show_invoice/show_quote
// routes. Deliberately returns the exact same shape sale.service.ts's getById() does (customer,
// businessLocation, items, resolvedInvoiceLayout) so the frontend can render it through the same
// InvoiceDocument templates already made draft-aware - a public quote link and an authenticated
// print preview are the same document, just reached two different ways.
export async function getSaleByPublicToken(token: string) {
  const sale = await prisma.sale.findFirst({
    where: { publicToken: token },
    include: {
      customer: { include: { defaultInvoiceLayout: true } },
      businessLocation: { include: { invoiceLayoutSettings: true } },
      createdByUser: { select: { fullNameEn: true } },
      items: { include: { product: true, service: true } },
      payments: { include: { paymentMethod: true } },
      registerSession: { select: { openedAt: true, openedByUser: { select: { fullNameEn: true } } } },
    },
  });
  if (!sale) throw new NotFoundError("Not found");
  const resolvedInvoiceLayout =
    sale.customer?.defaultInvoiceLayout ?? sale.businessLocation.invoiceLayoutSettings.find((l) => l.isDefault) ?? null;
  return { ...sale, resolvedInvoiceLayout };
}

// Reference's action-dropdown "Send Notification" (quotation-only, template_for=new_quotation) -
// an on-demand send, unlike every other trigger in this app which only ever fires as a side
// effect of checkout()/confirmQuote(). {quoteUrl} reuses the exact same lazily-generated token as
// "View Quote URL" (getOrCreateShareToken above) - sending a notification also mints the link if
// this is the first time either action has been used for this quote.
export async function sendQuoteNotification(saleId: string, organizationId: string, input: SendQuoteNotificationInput) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, organizationId, isQuotation: true },
    include: { customer: true, organization: { select: { nameEn: true } } },
  });
  if (!sale) throw new NotFoundError("Quote not found");

  const token = await getOrCreateShareToken(saleId, organizationId);
  const quoteUrl = `${env.clientUrl}/q/${token}`;
  const placeholders = {
    customerName: sale.customer.nameEn,
    quoteNumber: sale.quoteNumber ?? "",
    amount: sale.totalAmount.toFixed(2),
    quoteUrl,
  };

  if (input.mobile) {
    await sendTemplatedSms(organizationId, "NEW_QUOTATION", input.mobile, placeholders, "SALE", saleId);
  }
  if (input.email) {
    const subject = `Quotation ${sale.quoteNumber ?? ""} from ${sale.organization.nameEn}`;
    await sendTemplatedEmail(organizationId, "NEW_QUOTATION", input.email, subject, placeholders, "SALE", saleId);
  }
}

const QUOTE_SORTABLE_FIELDS = ["quoteNumber", "deliveryNumber", "totalAmount", "createdAt"];

// isQuotation selects which of the two DRAFT sub-types this list shows - true (default) is the
// existing Quotes list, false is List Deliveries (see the Sale.isQuotation schema comment).
// Filters mirror the reference's own draft.blade.php/quotations.blade.php + getDraftDatables():
// Business Location, Customer, Date Range, Created By, Customer Group - the one filter NOT built
// here is the reference's laundry-only Shipping Status, since this app has no shipping/order-status
// field on Sale yet (tracked separately as a queued laundry-workflow item, not silently dropped).
export async function listQuotes(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null, isQuotation: boolean = true) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, QUOTE_SORTABLE_FIELDS, "createdAt");

  const where: Prisma.SaleWhereInput = {
    organizationId,
    status: "DRAFT",
    isQuotation,
    ...resolveBusinessLocationFilter(query.businessLocationId ? String(query.businessLocationId) : undefined, allowedLocationIds),
    ...(query.customerId ? { customerId: String(query.customerId) } : {}),
    ...(query.createdBy ? { createdBy: String(query.createdBy) } : {}),
    ...(query.customerGroupId ? { customer: { customerGroupId: String(query.customerGroupId) } } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(String(query.from)) } : {}),
            ...(query.to ? { lte: new Date(String(query.to)) } : {}),
          },
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
        items: true,
        customer: {
          select: {
            id: true,
            nameEn: true,
            nameAr: true,
            phone: true,
            email: true,
            balance: true,
            cashBack: true,
            customerGroup: { select: { id: true, nameEn: true, nameAr: true } },
          },
        },
        businessLocation: { select: { branchName: true } },
        createdByUser: { select: { fullNameEn: true } },
      },
    }),
    prisma.sale.count({ where }),
  ]);

  return { data, meta: { page, limit, total } };
}

// --- Held ("suspended") sales -------------------------------------------------------------
// A cart parked mid-build, persisted server-side so it survives a page refresh, a different
// terminal, or the cashier logging out and back in - unlike an in-memory-only hold.

export async function holdSale(input: HoldSaleInput, createdBy: string, organizationId: string) {
  assertItemsMatchMode(input.items, input.mode);

  return prisma.heldSale.create({
    data: {
      organizationId,
      businessLocationId: input.businessLocationId,
      customerId: input.customerId,
      label: input.label,
      note: input.note,
      createdBy,
      items: {
        create: input.items.map((item) => ({
          productId: item.productId,
          serviceId: item.serviceId,
          descriptionEn: item.descriptionEn,
          descriptionAr: item.descriptionAr,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxPercent: item.taxPercent,
          taxType: item.taxType,
          discountAmount: item.discountAmount,
        })),
      },
    },
    include: { items: true },
  });
}

export async function listHeldSales(businessLocationId: string, organizationId: string, mode?: "SERVICE" | "PRODUCT") {
  const heldSales = await prisma.heldSale.findMany({
    where: { organizationId, businessLocationId },
    orderBy: { createdAt: "desc" },
    include: { items: true, customer: { select: { nameEn: true, nameAr: true } } },
  });

  // Unfiltered when mode is absent (legacy /pos sees everything, as today). When a mode is
  // given, only surface held sales whose items are ALL consistent with it - a Service-POS
  // cashier should never see (and fail to resume) a product-only or mixed held sale, and vice
  // versa. This is a UX safeguard, not the security boundary - checkout/hold-sale enforce that
  // server-side regardless of what this list happened to show.
  if (!mode) return heldSales;
  return heldSales.filter((held) => !held.items.some((item) => (mode === "SERVICE" ? item.productId : item.serviceId)));
}

export async function getHeldSale(id: string, organizationId: string) {
  const held = await prisma.heldSale.findFirst({
    where: { id, organizationId },
    include: { items: true, customer: true },
  });
  if (!held) throw new NotFoundError("Held sale not found");
  return held;
}

export async function discardHeldSale(id: string, organizationId: string) {
  const held = await prisma.heldSale.findFirst({ where: { id, organizationId } });
  if (!held) throw new NotFoundError("Held sale not found");
  await prisma.heldSale.delete({ where: { id } });
}

// --- Promotions at the POS (reference SellPosController@applyPromotion) ---------------------

/**
 * The POS "Apply" button (and the automatic try on Finalize / Save). Runs exactly what checkout()
 * will run, so the split rows and discounts the cashier sees are the ones the invoice gets.
 */
/** What both POS previews (promotion, coupon) need to price a cart exactly like checkout() does. */
async function previewPricing(
  tx: Prisma.TransactionClient,
  input: { businessLocationId: string; customerId: string; priceListId?: string },
  organizationId: string,
  actorId: string,
  callerPermissions: string[],
) {
  const customer = await tx.customer.findFirst({ where: { id: input.customerId, organizationId, deletedAt: null } });
  if (!customer) throw new NotFoundError("Customer not found");
  const businessLocation = await tx.businessLocation.findFirst({ where: { id: input.businessLocationId, organizationId } });
  if (!businessLocation) throw new NotFoundError("Business location not found");
  const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId }, select: { isSystemAdmin: true } });

  let priceListId = await resolvePriceListId(tx, input.customerId, organizationId, input.businessLocationId);
  if (input.priceListId) {
    const overridePriceList = await tx.priceList.findFirst({ where: { id: input.priceListId, organizationId } });
    if (!overridePriceList) throw new NotFoundError("Selling price group not found");
    priceListId = overridePriceList.id;
  }
  const overrides = await getPriceOverrides(tx, priceListId);
  const groupDiscountPercent = await resolveGroupDiscountPercent(tx, input.customerId, organizationId);
  const canEditLinePrice = actor.isSystemAdmin || callerPermissions.includes("pos.editLinePrice");
  /** checkout()'s price function for this cart's items. */
  const pricer = async (items: CartItem[]) => {
    const lineDiscountOf = await resolveLineDiscounts(tx, { organizationId, businessLocationId: input.businessLocationId, customerGroupId: customer.customerGroupId, priceListId, items });
    return (item: CartItem) => {
      const lineDiscount = lineDiscountOf(item);
      // A pre-filled discount that no longer applies takes its amount with it.
      const priced = item.discountId && !lineDiscount ? { ...item, discountId: undefined, discountAmount: 0 } : item;
      return priceLine(tx, priced, input.businessLocationId, organizationId, overrides, groupDiscountPercent, canEditLinePrice, lineDiscount);
    };
  };
  return { customer, businessLocation, pricer };
}

export async function previewPromotion(input: ApplyPromotionInput, organizationId: string, actorId: string, callerPermissions: string[] = []) {
  assertItemsMatchMode(input.items, input.mode);
  return prisma.$transaction(async (tx) => {
    const { customer, businessLocation, pricer } = await previewPricing(tx, input, organizationId, actorId, callerPermissions);
    const coupon = input.couponCode?.trim()
      ? await resolveCartCoupon(tx, {
          organizationId,
          code: input.couponCode,
          businessLocation: { id: businessLocation.id, groupId: businessLocation.groupId },
          customer: { id: customer.id, customerGroupId: customer.customerGroupId },
        })
      : null;
    const items = input.items as CartItem[];
    const price = await pricer(items);
    const baseLines = await Promise.all(items.map(price));

    const resolved = await resolvePromotion(tx, {
      organizationId,
      promotionId: input.promotionId,
      coupon,
      businessLocation: { id: businessLocation.id, groupId: businessLocation.groupId },
      customer: { id: customer.id, customerGroupId: customer.customerGroupId, priceListId: customer.priceListId },
      rows: toPricedRows(items, baseLines),
    });
    if (!resolved) return { applied: false as const, message: "Conditions do not match" };

    const segments = promotionCartItems(resolved, items);
    const priced = await Promise.all(segments.map((seg) => price(seg.item)));
    const { promotion } = resolved;
    return {
      applied: true as const,
      message: "Promotion applied successfully",
      promotion: { id: promotion.id, name: promotion.name, type: promotion.type, fullCash: promotion.fullCash, discountType: promotion.discountType, discountAmount: promotion.discountAmount },
      items: resolved.result.segments.map((seg, i) => ({
        sourceIndex: seg.sourceIndex,
        quantity: seg.pieces.toNumber(),
        discountAmount: priced[i].discountAmount.toNumber(),
        promoted: seg.promoted,
        free: seg.free,
      })),
      cashBack:
        promotion.type === "CASH_BACK"
          ? cashBackAmount(promotion, priced.reduce((sum, l) => sum.add(l.total), new Decimal(0))).toNumber()
          : null,
    };
  });
}

type ApplyCouponInput = z.infer<typeof applyCouponSchema>;

/**
 * The POS "Apply coupon" button (reference SellPosController@applyCoupon + pos.js
 * applyCouponSuccess). Runs exactly what checkout() will run and returns, per cart line (the
 * promotion's split rows when a promotion is on the cart), how much of that line's discount is the
 * coupon - and whether the coupon wipes the other discounts first.
 */
export async function previewCoupon(input: ApplyCouponInput, organizationId: string, actorId: string, callerPermissions: string[] = []) {
  assertItemsMatchMode(input.items, input.mode);
  return prisma.$transaction(async (tx) => {
    const { customer, businessLocation, pricer } = await previewPricing(tx, input, organizationId, actorId, callerPermissions);
    const coupon = await resolveCartCoupon(tx, {
      organizationId,
      code: input.code,
      businessLocation: { id: businessLocation.id, groupId: businessLocation.groupId },
      customer: { id: customer.id, customerGroupId: customer.customerGroupId },
    });
    const couponInfo = {
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      discountMode: coupon.discountMode,
      discountValue: coupon.discountValue,
      addedDiscount: coupon.addedDiscount,
      otp: coupon.otp,
    };
    // An OTP coupon waits for the customer's verification code (reference Send OTP).
    if (coupon.otp && !isValidCouponOtp(coupon.id, customer.id, input.otp)) {
      if (input.otp) throw new AppError(400, "Invalid verification code");
      return { otpRequired: true as const, message: "Send the verification code to the customer", coupon: couponInfo };
    }
    const items = (input.items as CartItem[]).map((item) => (coupon.addedDiscount ? item : { ...item, discountId: undefined, discountAmount: 0 }));
    const price = await pricer(items);
    const baseLines = await Promise.all(items.map(price));
    // Without "Added Discount" the coupon replaces the promotion, so a promotion on the cart is ignored here
    // (the POS cancels it when it applies the coupon).
    const resolved = await resolvePromotion(tx, {
      organizationId,
      promotionId: coupon.addedDiscount ? input.promotionId : undefined,
      coupon,
      businessLocation: { id: businessLocation.id, groupId: businessLocation.groupId },
      customer: { id: customer.id, customerGroupId: customer.customerGroupId, priceListId: customer.priceListId },
      rows: toPricedRows(items, baseLines),
    });
    const promotedItems = resolved ? promotionCartItems(resolved, items) : null;
    const pricedItems = promotedItems ? promotedItems.map((p) => p.item) : items;
    const lines = promotedItems ? await Promise.all(promotedItems.map(({ item }) => price(item))) : baseLines;
    const result = await applyCouponToLines(tx, { organizationId, coupon, items: pricedItems, lines, price });
    return {
      otpRequired: false as const,
      message: "Coupon applied successfully",
      coupon: couponInfo,
      // Reference applyCouponSuccess: without "Added Discount" the promotion is cancelled and every
      // row's line discount zeroed before the coupon goes on.
      clearsOtherDiscounts: !coupon.addedDiscount,
      lines: result.lines.map((l, i) => ({ couponDiscount: l.discountAmount.sub(lines[i].discountAmount).toDecimalPlaces(2).toNumber(), matched: Boolean(l.couponId) })),
      discountAmount: result.discountAmount.toNumber(),
    };
  });
}

/**
 * Reference SellPosController@getProductRow -> getProductDiscount(): the discount each cart item
 * gets, used by the POS to pre-fill the line discount as items are added. Checkout re-checks it.
 */
export async function matchLineDiscounts(
  input: { businessLocationId: string; customerId: string; priceListId?: string; itemKeys: string[] },
  organizationId: string,
) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, organizationId, deletedAt: null }, select: { customerGroupId: true } });
    if (!customer) throw new NotFoundError("Customer not found");
    let priceListId = await resolvePriceListId(tx, input.customerId, organizationId, input.businessLocationId);
    if (input.priceListId) {
      const overridePriceList = await tx.priceList.findFirst({ where: { id: input.priceListId, organizationId } });
      if (!overridePriceList) throw new NotFoundError("Selling price group not found");
      priceListId = overridePriceList.id;
    }
    const matches = await matchDiscounts(tx, {
      organizationId,
      businessLocationId: input.businessLocationId,
      customerGroupId: customer.customerGroupId,
      priceListId,
      itemKeys: input.itemKeys,
    });
    return Object.fromEntries(
      [...matches.entries()].map(([key, d]) => [
        key,
        { id: d.id, name: d.name, discountType: d.discountType, discountAmount: d.discountAmount.toString(), startsAt: d.startsAt, endsAt: d.endsAt },
      ]),
    );
  });
}
