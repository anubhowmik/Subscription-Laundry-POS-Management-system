import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError, ConflictError, NotFoundError } from "../../utils/AppError";
import { z } from "zod";
import { createCouponSchema, updateCouponSchema } from "./coupon.validators";

const { Decimal } = Prisma;

type CreateCouponInput = z.infer<typeof createCouponSchema>;
type UpdateCouponInput = z.infer<typeof updateCouponSchema>;

export async function list(organizationId: string) {
  return prisma.coupon.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
}

/**
 * SECURITY: none of these three FKs were previously checked against the caller's own org before
 * being written straight onto the coupon - found live during a role-based security audit, which
 * created a coupon in org A that referenced a customerId from a completely unrelated org B with
 * no error. Applies to businessLocationId/customerId/customerGroupId alike, since all three had
 * the identical gap.
 */
async function assertCouponRefsInOrg(
  input: { businessLocationId?: string | null; customerId?: string | null; customerGroupId?: string | null },
  organizationId: string,
) {
  if (input.businessLocationId) {
    const loc = await prisma.businessLocation.findFirst({ where: { id: input.businessLocationId, organizationId } });
    if (!loc) throw new AppError(400, "Business location not found in this organization");
  }
  if (input.customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: input.customerId, organizationId } });
    if (!customer) throw new AppError(400, "Customer not found in this organization");
  }
  if (input.customerGroupId) {
    const group = await prisma.customerGroup.findFirst({ where: { id: input.customerGroupId, organizationId } });
    if (!group) throw new AppError(400, "Customer group not found in this organization");
  }
}

export async function create(input: CreateCouponInput, organizationId: string) {
  const existing = await prisma.coupon.findFirst({ where: { organizationId, code: input.code } });
  if (existing) throw new ConflictError("A coupon with this code already exists");
  await assertCouponRefsInOrg(input, organizationId);

  return prisma.coupon.create({
    data: {
      organizationId,
      code: input.code,
      discountMode: input.discountMode,
      discountValue: input.discountValue,
      minPurchaseAmount: input.minPurchaseAmount,
      maxUses: input.maxUses ?? null,
      validFrom: input.validFrom ? new Date(input.validFrom) : null,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      isActive: input.isActive,
      businessLocationId: input.businessLocationId ?? null,
      customerId: input.customerId ?? null,
      customerGroupId: input.customerGroupId ?? null,
      maxUsesPerCustomer: input.maxUsesPerCustomer ?? null,
      maxDiscountAmount: input.maxDiscountAmount ?? null,
    },
  });
}

export async function update(id: string, input: UpdateCouponInput, organizationId: string) {
  const existing = await prisma.coupon.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Coupon not found");
  await assertCouponRefsInOrg(input, organizationId);

  return prisma.coupon.update({
    where: { id },
    data: {
      ...(input.discountMode ? { discountMode: input.discountMode } : {}),
      ...(input.discountValue !== undefined ? { discountValue: input.discountValue } : {}),
      ...(input.minPurchaseAmount !== undefined ? { minPurchaseAmount: input.minPurchaseAmount } : {}),
      ...(input.maxUses !== undefined ? { maxUses: input.maxUses } : {}),
      ...(input.validFrom !== undefined ? { validFrom: input.validFrom ? new Date(input.validFrom) : null } : {}),
      ...(input.validUntil !== undefined ? { validUntil: input.validUntil ? new Date(input.validUntil) : null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.businessLocationId !== undefined ? { businessLocationId: input.businessLocationId } : {}),
      ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
      ...(input.customerGroupId !== undefined ? { customerGroupId: input.customerGroupId } : {}),
      ...(input.maxUsesPerCustomer !== undefined ? { maxUsesPerCustomer: input.maxUsesPerCustomer } : {}),
      ...(input.maxDiscountAmount !== undefined ? { maxDiscountAmount: input.maxDiscountAmount } : {}),
    },
  });
}

export async function deactivate(id: string, organizationId: string) {
  const existing = await prisma.coupon.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Coupon not found");
  return prisma.coupon.update({ where: { id }, data: { isActive: false } });
}

/**
 * Preview-only check used by the POS "Coupon" button to tell the cashier whether a code is
 * valid before checkout. This is NOT the authoritative application - checkout re-validates and
 * computes the discount itself server-side, exactly like this, so a client can never forge a
 * discount by skipping this endpoint.
 */
export async function previewCoupon(
  code: string,
  subtotal: number,
  organizationId: string,
  customerId?: string,
  businessLocationId?: string,
) {
  const coupon = await prisma.coupon.findFirst({ where: { organizationId, code: code.trim().toUpperCase(), isActive: true } });
  if (!coupon) throw new AppError(400, "Invalid or inactive coupon code");

  const now = new Date();
  if (coupon.validFrom && coupon.validFrom > now) throw new AppError(400, "This coupon is not active yet");
  if (coupon.validUntil && coupon.validUntil < now) throw new AppError(400, "This coupon has expired");
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) throw new AppError(400, "This coupon has reached its usage limit");
  if (new Decimal(subtotal).lt(coupon.minPurchaseAmount)) {
    throw new AppError(400, `This coupon requires a minimum purchase of ${coupon.minPurchaseAmount.toFixed(2)}`);
  }
  // Same targeting/limit checks checkout() enforces - see pos.service.ts - so preview never shows
  // a discount the cashier can't actually apply.
  if (coupon.businessLocationId && businessLocationId && coupon.businessLocationId !== businessLocationId) {
    throw new AppError(400, "This coupon is not valid at this branch");
  }
  if (coupon.customerId && customerId && coupon.customerId !== customerId) {
    throw new AppError(400, "This coupon is not valid for this customer");
  }
  if (coupon.customerGroupId && customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, organizationId }, select: { customerGroupId: true } });
    if (!customer || customer.customerGroupId !== coupon.customerGroupId) {
      throw new AppError(400, "This coupon is not valid for this customer");
    }
  }
  if (coupon.maxUsesPerCustomer != null && customerId) {
    const usedByCustomer = await prisma.sale.count({ where: { couponId: coupon.id, customerId, status: "FINAL" } });
    if (usedByCustomer >= coupon.maxUsesPerCustomer) throw new AppError(400, "This coupon has already been used by this customer");
  }

  const raw = coupon.discountMode === "PERCENT" ? new Decimal(subtotal).mul(coupon.discountValue).div(100) : coupon.discountValue;
  let discountAmount = Decimal.min(raw, subtotal);
  if (coupon.maxDiscountAmount != null) discountAmount = Decimal.min(discountAmount, coupon.maxDiscountAmount);
  discountAmount = discountAmount.toDecimalPlaces(2);

  return { code: coupon.code, discountMode: coupon.discountMode, discountValue: coupon.discountValue, discountAmount: discountAmount.toString() };
}
