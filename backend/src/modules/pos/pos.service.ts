import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError, NotFoundError, ValidationError } from "../../utils/AppError";
import { CheckoutInput, HoldSaleInput, ConfirmQuoteInput } from "./pos.validators";
import { computeInvoiceHash, computeXmlInvoiceHash, GENESIS_PREVIOUS_HASH } from "../zatca/hashChain.service";
import { buildQrTlvBase64, buildSignedQrTlvBase64 } from "../zatca/qrCode.service";
import { buildInvoiceXml, UblInvoiceLine } from "../zatca/xmlGenerator.service";
import { signInvoiceXml } from "../zatca/digitalSignature.service";
import { decryptSecret } from "../../utils/secretBox";
import { resolvePriceListId, getPriceOverrides } from "../priceLists/priceListResolver";
import { parsePagination } from "../../utils/pagination";
import { sendTemplatedSms } from "../notifications/notifications.service";
import { claimBusinessLocationNumber } from "../../utils/documentNumbering";
import { resolveBusinessLocationFilter } from "../../utils/locationScope";
import { adjustCashbackTx } from "../cashback/cashback.service";
import { verifyAndConsumeSessionTx } from "../bnpl/bnpl.service";
import { BNPL_PAYMENT_CODES } from "../bnpl/bnpl.constants";

const { Decimal } = Prisma;

export async function search(businessLocationId: string, query: string | undefined, organizationId: string, customerId?: string) {
  const search = (query ?? "").trim();

  const priceListId = await resolvePriceListId(prisma, customerId, organizationId, businessLocationId);
  const overrides = await getPriceOverrides(prisma, priceListId);

  const [products, services] = await Promise.all([
    prisma.product.findMany({
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
    prisma.service.findMany({
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
      price: overrides.products.get(p.id) ?? p.sellingPrice,
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
      price: overrides.services.get(s.id) ?? s.price,
      taxPercent: s.tax?.percentage ?? new Decimal(0),
      taxType: "EXCLUSIVE" as const,
      unit: s.unit.shortName,
    })),
  };
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
}

async function priceLine(
  tx: Prisma.TransactionClient,
  item: CheckoutInput["items"][number],
  businessLocationId: string,
  organizationId: string,
  overrides: { products: Map<string, Prisma.Decimal>; services: Map<string, Prisma.Decimal> },
): Promise<PricedLine> {
  const quantity = new Decimal(item.quantity);
  const discountAmount = new Decimal(item.discountAmount ?? 0);

  if (item.productId) {
    const product = await tx.product.findFirst({
      where: { id: item.productId, organizationId, status: "ACTIVE", deletedAt: null, businessLocations: { some: { businessLocationId } } },
      include: { tax: true },
    });
    if (!product) throw new NotFoundError(`Product not found or not available at this location: ${item.productId}`);

    const unitPrice = overrides.products.get(product.id) ?? product.sellingPrice;
    const taxPercent = product.tax?.percentage ?? new Decimal(0);
    const gross = unitPrice.mul(quantity).sub(discountAmount);
    let subtotal: Prisma.Decimal;
    let taxAmount: Prisma.Decimal;
    if (product.sellingPriceTaxType === "INCLUSIVE") {
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
      total: gross.toDecimalPlaces(2),
      manageStock: product.manageStock,
      taxCategoryCode: product.tax?.categoryCode ?? "S",
    };
  }

  const service = await tx.service.findFirst({
    where: { id: item.serviceId, organizationId, status: "ACTIVE", businessLocations: { some: { businessLocationId } } },
    include: { tax: true },
  });
  if (!service) throw new NotFoundError(`Service not found or not available at this location: ${item.serviceId}`);

  const unitPrice = overrides.services.get(service.id) ?? service.price;
  const taxPercent = service.tax?.percentage ?? new Decimal(0);
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
    taxCategoryCode: service.tax?.categoryCode ?? "S",
    estimatedProcessingHours: service.estimatedProcessingHours,
  };
}

export async function checkout(input: CheckoutInput, createdBy: string, organizationId: string) {
  const sale = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, organizationId, deletedAt: null } });
    if (!customer) throw new NotFoundError("Customer not found");

    if (customer.approvalStatus === "PENDING") {
      throw new AppError(400, "Customer is pending approval");
    }

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

    const priceListId = await resolvePriceListId(tx, input.customerId, organizationId, input.businessLocationId);
    const overrides = await getPriceOverrides(tx, priceListId);
    const lines = await Promise.all(input.items.map((item) => priceLine(tx, item, input.businessLocationId, organizationId, overrides)));

    const lineSubtotal = lines.reduce((sum, l) => sum.add(l.subtotal), new Decimal(0));
    const lineTaxAmount = lines.reduce((sum, l) => sum.add(l.taxAmount), new Decimal(0));
    const lineDiscountAmount = lines.reduce((sum, l) => sum.add(l.discountAmount), new Decimal(0));

    // --- Coupon: validated and priced here, server-side, never trusting a client-sent amount ---
    let couponId: string | undefined;
    let couponDiscountAmount = new Decimal(0);
    if (input.couponCode) {
      const coupon = await tx.coupon.findFirst({
        where: { organizationId, code: input.couponCode.trim().toUpperCase(), isActive: true },
      });
      if (!coupon) throw new AppError(400, "Invalid or inactive coupon code");
      const now = new Date();
      if (coupon.validFrom && coupon.validFrom > now) throw new AppError(400, "This coupon is not active yet");
      if (coupon.validUntil && coupon.validUntil < now) throw new AppError(400, "This coupon has expired");
      if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
        throw new AppError(400, "This coupon has reached its usage limit");
      }
      if (lineSubtotal.lt(coupon.minPurchaseAmount)) {
        throw new AppError(400, `This coupon requires a minimum purchase of ${coupon.minPurchaseAmount.toFixed(2)}`);
      }
      // Targeting + per-customer limit - all null on the coupon means unrestricted, matching the
      // pre-targeting default behavior exactly.
      if (coupon.businessLocationId && coupon.businessLocationId !== input.businessLocationId) {
        throw new AppError(400, "This coupon is not valid at this branch");
      }
      if (coupon.customerId && coupon.customerId !== input.customerId) {
        throw new AppError(400, "This coupon is not valid for this customer");
      }
      if (coupon.customerGroupId && customer.customerGroupId !== coupon.customerGroupId) {
        throw new AppError(400, "This coupon is not valid for this customer");
      }
      if (coupon.maxUsesPerCustomer != null) {
        const usedByCustomer = await tx.sale.count({ where: { couponId: coupon.id, customerId: input.customerId, status: "FINAL" } });
        if (usedByCustomer >= coupon.maxUsesPerCustomer) {
          throw new AppError(400, "This coupon has already been used by this customer");
        }
      }
      couponId = coupon.id;
      const raw = coupon.discountMode === "PERCENT" ? lineSubtotal.mul(coupon.discountValue).div(100) : coupon.discountValue;
      couponDiscountAmount = Decimal.min(raw, lineSubtotal);
      if (coupon.maxDiscountAmount != null) couponDiscountAmount = Decimal.min(couponDiscountAmount, coupon.maxDiscountAmount);
      couponDiscountAmount = couponDiscountAmount.toDecimalPlaces(2);
      // A DRAFT quote hasn't actually "used" the coupon yet - nothing should need reversing if
      // it's later voided (see voidQuote), so usage is only counted once confirmQuote() runs.
      if (!input.asDraft) {
        await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
      }
    }

    // The coupon is netted into `subtotal` exactly the way line-level discounts already are
    // (see priceLine above) - both reduce the taxable base that the ZATCA XML/hash/QR treat as
    // authoritative, while `discountAmount` stays purely informational disclosure of how much
    // was taken off in total. Tax is recomputed proportionally on the reduced base; this is a
    // reasonable approximation for a single-VAT-rate storefront and does not attempt per-line
    // reallocation across mixed tax categories.
    const effectiveTaxRate = lineSubtotal.gt(0) ? lineTaxAmount.div(lineSubtotal) : new Decimal(0);
    const subtotalAfterCoupon = lineSubtotal.sub(couponDiscountAmount);

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
    if (org.rewardPointsEnabled && !input.asDraft) {
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
    const discountAmount = lineDiscountAmount.add(couponDiscountAmount).add(invoiceDiscountAmount).add(pointsDiscountAmount);
    const totalAmount = subtotal.add(taxAmount);

    // --- Customer-group monthly spend/volume caps (P8-3) - enforced against the WHOLE group's
    // combined FINAL sales this calendar month, not just this customer's own. All-null on the
    // group means unrestricted. Quotes don't count against the cap - only real checkouts do. ---
    if (!input.asDraft && customer.customerGroupId) {
      const group = await tx.customerGroup.findUnique({ where: { id: customer.customerGroupId } });
      if (group && (group.maxAmountPerMonth != null || group.maxInvoicesPerMonth != null || group.maxQtyPerMonth != null)) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const monthWhere: Prisma.SaleWhereInput = {
          organizationId,
          status: "FINAL",
          saleDate: { gte: monthStart, lt: monthEnd },
          customer: { customerGroupId: group.id },
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

    // The whole order is "ready" once its slowest service line finishes - not the fastest -
    // so this takes the max hours across service lines, not an average or the first one.
    const serviceHours = lines.map((l) => l.estimatedProcessingHours).filter((h): h is number => h != null);
    const estimatedReadyAt = serviceHours.length > 0 ? new Date(saleDate.getTime() + Math.max(...serviceHours) * 60 * 60 * 1000) : null;

    // --- Quote (asDraft): freeze the priced lines/totals now and stop - no stock deduction, no
    // ZATCA (icv/hash/XML/signature/QR all stay null), no payments, no customer balance change,
    // no loyalty earn/redeem. confirmQuote() runs all of that later against these exact totals,
    // only re-checking that stock is still available. Deliberately simpler than the reference,
    // which re-resolves pricing fresh at confirm time - see docs plan section 7. ---
    if (input.asDraft) {
      const quoteSaleId = randomUUID();
      const quoteNumber = await claimBusinessLocationNumber(tx, input.businessLocationId, "quote");

      const quoteSale = await tx.sale.create({
        data: {
          id: quoteSaleId,
          organizationId,
          quoteNumber,
          invoiceNumber: null,
          businessLocationId: input.businessLocationId,
          customerId: input.customerId,
          saleDate,
          estimatedReadyAt,
          status: "DRAFT",
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
          couponDiscountAmount,
          invoiceDiscountAmount,
          shippingAmount,
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
        })),
      });

      return tx.sale.findUniqueOrThrow({
        where: { id: quoteSale.id },
        include: { items: true, payments: true, customer: true, businessLocation: true },
      });
    }

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

    let invoiceHash: string;
    let qrCodeBase64: string;
    let xmlContent: string | undefined;
    let digitalSignature: string | undefined;
    let publicKeyPem: string | undefined;

    if (certificate) {
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
      }));

      xmlContent = buildInvoiceXml({
        invoiceId: invoiceNumber,
        uuid: saleId,
        icv,
        previousInvoiceHash,
        issueDateIso: saleDate.toISOString().slice(0, 10),
        issueTimeIso: saleDate.toISOString().slice(11, 19),
        invoiceTypeCode,
        currency: businessLocation.currency,
        seller: {
          nameEn: businessLocation.businessNameEn,
          vatNumber: businessLocation.vatNumber,
          crNumber: businessLocation.crNumber,
          city: businessLocation.city,
          address: businessLocation.address,
        },
        buyer: { name: customer.nameEn, vatNumber: customer.vatNumber },
        lines: ublLines,
        subtotal: subtotal.toDecimalPlaces(2).toString(),
        discountAmount: discountAmount.toDecimalPlaces(2).toString(),
        taxAmount: taxAmount.toDecimalPlaces(2).toString(),
        totalAmount: totalAmount.toDecimalPlaces(2).toString(),
      });

      invoiceHash = computeXmlInvoiceHash(xmlContent);
      const privateKeyPem = decryptSecret(certificate.privateKeyEncrypted);
      digitalSignature = signInvoiceXml(xmlContent, privateKeyPem);
      publicKeyPem = certificate.publicKeyPem;

      qrCodeBase64 = buildSignedQrTlvBase64({
        sellerName: businessLocation.businessNameAr,
        vatNumber: businessLocation.vatNumber,
        timestampIso: saleDate.toISOString(),
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
        timestampIso: saleDate.toISOString(),
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
        saleDate,
        estimatedReadyAt,
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
        couponDiscountAmount,
        invoiceDiscountAmount,
        shippingAmount,
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
      await tx.payment.create({
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
    }

    if (input.payments.length > 0) {
      await tx.payment.createMany({
        data: input.payments.map((p) => ({
          saleId: sale.id,
          customerId: input.customerId,
          businessLocationId: input.businessLocationId,
          amount: p.amount,
          paymentMethodId: p.paymentMethodId,
          type: "SALE_PAYMENT" as const,
          referenceNumber: p.referenceNumber,
          createdBy,
        })),
      });

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
      include: { items: true, payments: { include: { paymentMethod: true } }, customer: true, businessLocation: true },
    });
  });

  // Fired after commit, never inside the transaction - an SMS failure must never roll back a real
  // sale. Guarded on FINAL so saving a quote (asDraft) never fires a "new sale"/"payment received"
  // text - nothing was actually sold yet.
  if (sale.status === "FINAL" && sale.customer.phone) {
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

    let invoiceHash: string;
    let qrCodeBase64: string;
    let xmlContent: string | undefined;
    let digitalSignature: string | undefined;
    let publicKeyPem: string | undefined;

    if (certificate) {
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
      }));

      xmlContent = buildInvoiceXml({
        invoiceId: invoiceNumber,
        uuid: draft.id,
        icv,
        previousInvoiceHash,
        issueDateIso: saleDate.toISOString().slice(0, 10),
        issueTimeIso: saleDate.toISOString().slice(11, 19),
        invoiceTypeCode,
        currency: businessLocation.currency,
        seller: {
          nameEn: businessLocation.businessNameEn,
          vatNumber: businessLocation.vatNumber,
          crNumber: businessLocation.crNumber,
          city: businessLocation.city,
          address: businessLocation.address,
        },
        buyer: { name: customer.nameEn, vatNumber: customer.vatNumber },
        lines: ublLines,
        subtotal: draft.subtotal.toString(),
        discountAmount: draft.discountAmount.toString(),
        taxAmount: draft.taxAmount.toString(),
        totalAmount: draft.totalAmount.toString(),
      });

      invoiceHash = computeXmlInvoiceHash(xmlContent);
      const privateKeyPem = decryptSecret(certificate.privateKeyEncrypted);
      digitalSignature = signInvoiceXml(xmlContent, privateKeyPem);
      publicKeyPem = certificate.publicKeyPem;

      qrCodeBase64 = buildSignedQrTlvBase64({
        sellerName: businessLocation.businessNameAr,
        vatNumber: businessLocation.vatNumber,
        timestampIso: saleDate.toISOString(),
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
        timestampIso: saleDate.toISOString(),
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
      await tx.payment.create({
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
    }

    if (input.payments.length > 0) {
      await tx.payment.createMany({
        data: input.payments.map((p) => ({
          saleId: draft.id,
          customerId: draft.customerId,
          businessLocationId: draft.businessLocationId,
          amount: p.amount,
          paymentMethodId: p.paymentMethodId,
          type: "SALE_PAYMENT" as const,
          referenceNumber: p.referenceNumber,
          createdBy,
        })),
      });

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
      include: { items: true, payments: { include: { paymentMethod: true } }, customer: true, businessLocation: true },
    });
  });

  // Same post-commit trigger pair as checkout() - a confirmed quote is the first moment it
  // becomes a real invoice, so it gets the same NEW_SALE/PAYMENT_RECEIVED texts a direct sale would.
  if (sale.customer.phone) {
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

export async function listQuotes(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);

  const where: Prisma.SaleWhereInput = {
    organizationId,
    status: "DRAFT",
    ...resolveBusinessLocationFilter(query.businessLocationId ? String(query.businessLocationId) : undefined, allowedLocationIds),
  };

  const [data, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        items: true,
        customer: { select: { id: true, nameEn: true, nameAr: true, phone: true, balance: true } },
        businessLocation: { select: { branchName: true } },
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

export async function listHeldSales(businessLocationId: string, organizationId: string) {
  return prisma.heldSale.findMany({
    where: { organizationId, businessLocationId },
    orderBy: { createdAt: "desc" },
    include: { items: true, customer: { select: { nameEn: true, nameAr: true } } },
  });
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
