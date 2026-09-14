import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError, AuthorizationError, ConflictError, NotFoundError, ValidationError } from "../../utils/AppError";
import { parsePagination, parseSort } from "../../utils/pagination";
import { assertLocationAllowed, resolveBusinessLocationFilter } from "../../utils/locationScope";
import { adjustPoints } from "../loyalty/loyalty.service";
import { adjustCashback } from "../cashback/cashback.service";
import * as couponService from "../coupons/coupon.service";
import { sendTemplatedSms } from "../notifications/notifications.service";

interface CreateCompensationItemInput {
  saleItemId: string;
  quantity: number;
  reason: "LOST" | "DAMAGED" | "DELAYED" | "OTHER";
  claimedAmount: number;
}

interface CreateCompensationInput {
  saleId: string;
  description?: string;
  items: CreateCompensationItemInput[];
}

const COMPENSATION_INCLUDE = {
  sale: { select: { invoiceNumber: true } },
  customer: { select: { nameEn: true, nameAr: true } },
  createdByUser: { select: { fullNameEn: true } },
  resolvedByUser: { select: { fullNameEn: true } },
  resolutionCoupon: { select: { code: true } },
  items: { include: { saleItem: { select: { descriptionEn: true, descriptionAr: true } } } },
} satisfies Prisma.CompensationInclude;

/** A claim always covers at least one specific sale item (mirrors SellReturnItem - no more
 * "whole invoice, no line detail" claims). Covering the whole invoice just means listing every
 * item. Header claimedAmount is the sum of the item claims, same pattern as SellReturn.totalAmount. */
export async function create(input: CreateCompensationInput, organizationId: string, createdBy: string) {
  const sale = await prisma.sale.findFirst({ where: { id: input.saleId, organizationId } });
  if (!sale) throw new NotFoundError("Sale not found");
  if (input.items.length === 0) {
    throw new ValidationError([{ field: "items", message: "At least one item is required" }], "At least one item is required");
  }

  const saleItemIds = [...new Set(input.items.map((i) => i.saleItemId))];
  const saleItems = await prisma.saleItem.findMany({ where: { id: { in: saleItemIds }, saleId: input.saleId } });
  if (saleItems.length !== saleItemIds.length) {
    throw new ValidationError([{ field: "items", message: "One or more items do not belong to this sale" }], "Invalid sale item");
  }

  const claimedAmount = input.items.reduce((sum, i) => sum + i.claimedAmount, 0);

  const compensation = await prisma.compensation.create({
    data: {
      organizationId,
      saleId: input.saleId,
      customerId: sale.customerId,
      businessLocationId: sale.businessLocationId,
      description: input.description,
      claimedAmount,
      createdBy,
      items: {
        create: input.items.map((i) => ({
          saleItemId: i.saleItemId,
          quantity: i.quantity,
          reason: i.reason,
          claimedAmount: i.claimedAmount,
        })),
      },
    },
    include: COMPENSATION_INCLUDE,
  });
  return compensation;
}

interface ViewScope {
  canViewAll: boolean;
  userId: string;
}

// Claims accumulate indefinitely (every damaged/lost-item dispute files a new one) - genuinely
// unbounded, so the list page gets real sortable columns, not just a fixed createdAt order.
const SORTABLE_FIELDS = ["claimedAmount", "approvedAmount", "status", "createdAt"];

export async function list(
  query: Record<string, unknown>,
  organizationId: string,
  allowedLocationIds: string[] | null,
  scope: ViewScope,
) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "createdAt");
  const where: Prisma.CompensationWhereInput = {
    organizationId,
    ...resolveBusinessLocationFilter(query.businessLocationId ? String(query.businessLocationId) : undefined, allowedLocationIds),
    ...(query.status ? { status: query.status as "PENDING" | "APPROVED" | "REJECTED" | "PAID" } : {}),
    // Segregation of duties (P8-6): a user who can only file claims sees just their own; anyone
    // holding view_all (typically bundled with approve/pay) sees the whole location-scoped list.
    ...(scope.canViewAll ? {} : { createdBy: scope.userId }),
  };

  const [data, total] = await Promise.all([
    prisma.compensation.findMany({ where, orderBy, skip, take: limit, include: COMPENSATION_INCLUDE }),
    prisma.compensation.count({ where }),
  ]);

  return { data, meta: { page, limit, total } };
}

interface ResolveCompensationInput {
  status: "APPROVED" | "REJECTED" | "PAID";
  resolutionType?: "CASH" | "POINTS" | "COUPON" | "CASHBACK";
  resolutionValue?: number;
}

interface ResolveActor {
  isSystemAdmin: boolean;
  permissions: string[];
  allowedLocationIds: string[] | null;
}

/**
 * PENDING -> APPROVED/REJECTED and APPROVED -> PAID are two different privileges (P8-6
 * segregation of duties) even though both flow through this one endpoint - the service layer
 * checks which permission the specific requested transition needs, not just route middleware,
 * since a single `requirePermission` on the route can only express "has either", not "has the
 * right one for this transition".
 */
export async function resolve(id: string, input: ResolveCompensationInput, organizationId: string, resolvedBy: string, actor: ResolveActor) {
  const compensation = await prisma.compensation.findFirst({ where: { id, organizationId }, include: { items: true } });
  if (!compensation) throw new NotFoundError("Compensation not found");
  assertLocationAllowed(compensation.businessLocationId, actor.allowedLocationIds);

  const can = (code: string) => actor.isSystemAdmin || actor.permissions.includes(code);

  const isApprovalTransition = input.status === "APPROVED" || input.status === "REJECTED";
  if (isApprovalTransition) {
    if (compensation.status !== "PENDING") throw new AppError(409, "Only a pending claim can be approved or rejected");
    if (!can("compensations.approve")) throw new AuthorizationError("You do not have permission to approve or reject compensation claims");
  }
  if (input.status === "PAID") {
    if (compensation.status !== "APPROVED") throw new AppError(409, "Only an approved claim can be marked paid");
    if (!can("compensations.pay")) throw new AuthorizationError("You do not have permission to mark compensation claims as paid");
  }

  // resolutionType only ever fires its auto-trigger the moment a claim actually becomes PAID -
  // re-saving an already-PAID claim must not re-credit points or mint a second coupon.
  const isNewlyPaid = input.status === "PAID" && compensation.status !== "PAID";
  let resolutionCouponId: string | undefined;

  if (isNewlyPaid && input.resolutionType === "POINTS" && input.resolutionValue) {
    await adjustPoints(
      compensation.customerId,
      Math.round(input.resolutionValue),
      `Compensation claim ${compensation.id} resolved`,
      organizationId,
      resolvedBy,
    );
  }

  if (isNewlyPaid && input.resolutionType === "CASHBACK" && input.resolutionValue) {
    await adjustCashback(
      compensation.customerId,
      input.resolutionValue,
      "GRANT",
      `Compensation claim ${compensation.id} resolved`,
      organizationId,
      resolvedBy,
      { compensationId: compensation.id },
    );
  }

  if (isNewlyPaid && input.resolutionType === "COUPON" && input.resolutionValue) {
    const code = `COMP-${randomBytes(4).toString("hex").toUpperCase()}`;
    const coupon = await couponService.create(
      { code, discountMode: "FIXED", discountValue: input.resolutionValue, minPurchaseAmount: 0, maxUses: 1, isActive: true },
      organizationId,
    );
    resolutionCouponId = coupon.id;
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Full approval only (no partial per-item amounts in this pass) - every item's approvedAmount
    // is set to its own claimedAmount, so the header sum below always equals claimedAmount.
    if (input.status === "APPROVED") {
      await Promise.all(
        compensation.items.map((item) =>
          tx.compensationItem.update({ where: { id: item.id }, data: { approvedAmount: item.claimedAmount } }),
        ),
      );
    }

    return tx.compensation.update({
      where: { id },
      data: {
        status: input.status,
        approvedAmount: input.status === "REJECTED" ? null : (compensation.approvedAmount ?? compensation.claimedAmount),
        resolvedAt: new Date(),
        resolvedBy,
        ...(isNewlyPaid ? { resolutionType: input.resolutionType, resolutionValue: input.resolutionValue } : {}),
        ...(resolutionCouponId ? { resolutionCouponId } : {}),
      },
      include: COMPENSATION_INCLUDE,
    });
  });

  if (isNewlyPaid && updated.approvedAmount) {
    await sendTemplatedSms(
      organizationId,
      "COMPENSATION_RESOLVED",
      (await prisma.customer.findUniqueOrThrow({ where: { id: updated.customerId }, select: { phone: true } })).phone,
      { amount: updated.approvedAmount.toFixed(2) },
      "COMPENSATION",
      updated.id,
    );
  }

  return updated;
}

/** No side effects to reverse - resolve() never touches stock or money until PAID - so this is a
 * plain delete (cascades to CompensationItem), blocked once a claim has actually been paid out. */
interface RemoveActor {
  isSystemAdmin: boolean;
  permissions: string[];
  allowedLocationIds: string[] | null;
  userId: string;
}

/**
 * SECURITY: the route only requires compensations.file OR compensations.approve (see
 * compensation.routes.ts) - without an ownership check here, anyone who can file a claim could
 * delete ANY claim in the org, including ones filed by other people they can't even see in their
 * own list (view_own scoping in list() above). Someone holding compensations.approve is trusted
 * with claims org-wide already, so they may delete any non-PAID claim; a filer may only delete
 * their own.
 */
export async function remove(id: string, organizationId: string, actor: RemoveActor) {
  const compensation = await prisma.compensation.findFirst({ where: { id, organizationId } });
  if (!compensation) throw new NotFoundError("Compensation not found");
  if (compensation.status === "PAID") {
    throw new ConflictError("Cannot delete a compensation claim that has already been paid");
  }
  assertLocationAllowed(compensation.businessLocationId, actor.allowedLocationIds);

  const canDeleteAny = actor.isSystemAdmin || actor.permissions.includes("compensations.approve");
  if (!canDeleteAny && compensation.createdBy !== actor.userId) {
    throw new AuthorizationError("You can only delete compensation claims you filed yourself");
  }

  await prisma.compensation.delete({ where: { id } });
}
