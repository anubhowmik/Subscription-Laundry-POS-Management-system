import { BillingInterval } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { AppError, NotFoundError } from "../../utils/AppError";
import { getGateway } from "./paymentGateway";
import { getEntitlement } from "./entitlement.service";
import { SEAT_PRICE_SAR } from "../../config/plans";

/** The three ways to buy the single product. */
export type PurchaseInterval = "MONTHLY" | "ANNUAL" | "LIFETIME";

export async function listPlans() {
  const plans = await prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceMonthly: "asc" } });
  return plans.map((p) => ({
    id: p.id,
    code: p.code,
    nameEn: p.nameEn,
    nameAr: p.nameAr,
    priceMonthly: p.priceMonthly,
    priceAnnual: p.priceAnnual,
    priceLifetime: p.priceLifetime,
    maxBranches: p.maxBranches,
    maxUsers: p.maxUsers,
    currency: env.defaultCurrency,
  }));
}

export async function getCurrentSubscription(organizationId: string) {
  const entitlement = await getEntitlement(organizationId);
  return {
    hasAccess: entitlement.hasAccess,
    reason: entitlement.reason,
    isTrial: entitlement.isTrial,
    trialDaysLeft: entitlement.trialDaysLeft,
    expiresAt: entitlement.expiresAt,
    organizationStatus: entitlement.organizationStatus,
    subscription: entitlement.subscription,
    plan: entitlement.plan,
  };
}

function priceForInterval(
  plan: { priceMonthly: unknown; priceAnnual: unknown; priceLifetime: unknown },
  interval: PurchaseInterval,
): number {
  const raw =
    interval === "MONTHLY" ? plan.priceMonthly : interval === "ANNUAL" ? plan.priceAnnual : plan.priceLifetime;
  if (raw === null || raw === undefined) {
    throw new AppError(400, `This plan is not available on a ${interval.toLowerCase()} basis`);
  }
  return Number(raw);
}

/**
 * Starts a purchase: records a PENDING BillingPayment, asks the gateway for a hosted checkout,
 * and returns the URL to send the customer to. No access is granted here - that only happens
 * after the payment is confirmed server-side in `verifyPayment`.
 */
export async function createCheckout(organizationId: string, planCode: string, interval: PurchaseInterval) {
  const plan = await prisma.plan.findFirst({ where: { code: planCode, isActive: true } });
  if (!plan) throw new NotFoundError("Plan not found");

  const amountSar = priceForInterval(plan, interval);

  const payment = await prisma.billingPayment.create({
    data: {
      organizationId,
      planId: plan.id,
      amount: amountSar,
      currency: env.defaultCurrency,
      billingInterval: interval as BillingInterval,
      status: "PENDING",
      gateway: getGateway().name,
    },
  });

  // The gateway returns the customer to the FRONTEND, which then calls verifyPayment with its
  // auth token. We include our own payment id so the frontend knows what to verify.
  const callbackUrl = `${env.billing.appUrl}/billing/callback?bp=${payment.id}`;

  const created = await getGateway().createPayment({
    amountSar,
    description: `${plan.nameEn} - ${interval.toLowerCase()}`,
    callbackUrl,
    metadata: { billingPaymentId: payment.id, organizationId },
  });

  await prisma.billingPayment.update({
    where: { id: payment.id },
    data: { gatewayPaymentId: created.id },
  });

  return { redirectUrl: created.redirectUrl, billingPaymentId: payment.id };
}

/**
 * Starts a one-time additional-user-seat purchase - $10 x quantity, no plan/subscription
 * involved at all. Same "record PENDING, ask the gateway, return a redirect" shape as
 * createCheckout() above, reusing the exact same PaymentGateway contract; the only difference
 * is what verifyPayment() does once the gateway confirms it (see the SEAT_LICENSE branch below).
 */
export async function createSeatCheckout(organizationId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AppError(400, "Seat quantity must be a positive whole number");
  }
  const amountSar = SEAT_PRICE_SAR * quantity;

  const payment = await prisma.billingPayment.create({
    data: {
      organizationId,
      purpose: "SEAT_LICENSE",
      seatQuantity: quantity,
      amount: amountSar,
      currency: env.defaultCurrency,
      status: "PENDING",
      gateway: getGateway().name,
    },
  });

  const callbackUrl = `${env.billing.appUrl}/billing/callback?bp=${payment.id}`;

  const created = await getGateway().createPayment({
    amountSar,
    description: `${quantity} additional user seat${quantity === 1 ? "" : "s"} - one-time`,
    callbackUrl,
    metadata: { billingPaymentId: payment.id, organizationId, purpose: "SEAT_LICENSE" },
  });

  await prisma.billingPayment.update({ where: { id: payment.id }, data: { gatewayPaymentId: created.id } });

  return { redirectUrl: created.redirectUrl, billingPaymentId: payment.id };
}

/** Purchased/used/available seat counts and purchase history for the Licenses page. */
export async function getSeatSummary(organizationId: string) {
  const [organization, usedCount, history] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { purchasedUserSeats: true } }),
    prisma.user.count({ where: { organizationId, status: "ACTIVE", deletedAt: null, allowLogin: true } }),
    prisma.billingPayment.findMany({
      where: { organizationId, purpose: "SEAT_LICENSE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, seatQuantity: true, amount: true, currency: true, status: true, createdAt: true, paidAt: true },
    }),
  ]);

  return {
    purchasedUserSeats: organization.purchasedUserSeats,
    usedUserSeats: usedCount,
    availableUserSeats: Math.max(0, organization.purchasedUserSeats - usedCount),
    seatPriceSar: SEAT_PRICE_SAR,
    history,
  };
}

function computePeriodEnd(interval: PurchaseInterval, from: Date): Date | null {
  if (interval === "LIFETIME") return null; // never expires
  const end = new Date(from);
  if (interval === "MONTHLY") end.setMonth(end.getMonth() + 1);
  else end.setFullYear(end.getFullYear() + 1);
  return end;
}

/**
 * Confirms a payment and unlocks the organization. Called after the customer is redirected
 * back. SECURITY: it re-fetches the payment from the gateway and checks status + amount rather
 * than trusting anything in the redirect URL. It also verifies the payment belongs to the
 * calling organization, and is idempotent so a double-submit cannot double-charge or corrupt
 * the subscription.
 */
export async function verifyPayment(billingPaymentId: string, organizationId: string) {
  const payment = await prisma.billingPayment.findFirst({
    where: { id: billingPaymentId, organizationId },
  });
  if (!payment) throw new NotFoundError("Payment not found");

  // Already processed - return the current state without touching anything again.
  if (payment.status === "PAID") return { status: "PAID" as const, alreadyProcessed: true };
  if (!payment.gatewayPaymentId) throw new AppError(400, "This payment was never sent to the gateway");

  const fetched = await getGateway().fetchPayment(payment.gatewayPaymentId);
  if (!fetched) throw new AppError(400, "The gateway does not recognise this payment");

  if (fetched.status !== "paid") {
    await prisma.billingPayment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: `Gateway status: ${fetched.status}`, gatewayResponseRaw: fetched.raw as object },
    });
    throw new AppError(402, "Payment was not completed");
  }

  // Guard against a customer paying a smaller amount than the plan costs (tampered checkout).
  if (Math.abs(fetched.amountSar - Number(payment.amount)) > 0.001) {
    logger.error(
      { billingPaymentId, expected: Number(payment.amount), charged: fetched.amountSar },
      "Billing amount mismatch - refusing to activate",
    );
    await prisma.billingPayment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: "Charged amount did not match plan price", gatewayResponseRaw: fetched.raw as object },
    });
    throw new AppError(400, "Paid amount did not match the plan price");
  }

  const now = new Date();

  // Deliberately decoupled: a SEAT_LICENSE payment only ever touches
  // Organization.purchasedUserSeats, never Subscription/Organization.status; a SUBSCRIPTION
  // payment only ever touches Subscription/Organization.status, never purchasedUserSeats. This
  // is what keeps "can this org use the product at all" (the org access gate) and "how many
  // users can this org add" (seat licensing) fully independent, by construction, not convention.
  if (payment.purpose === "SEAT_LICENSE") {
    await prisma.$transaction(async (tx) => {
      await tx.billingPayment.update({
        where: { id: payment.id },
        data: { status: "PAID", paidAt: now, gatewayResponseRaw: fetched.raw as object },
      });
      await tx.organization.update({
        where: { id: organizationId },
        data: { purchasedUserSeats: { increment: payment.seatQuantity ?? 0 } },
      });
    });

    logger.info({ organizationId, billingPaymentId, seatQuantity: payment.seatQuantity }, "Seat license(s) purchased");
    return { status: "PAID" as const, alreadyProcessed: false };
  }

  const interval = payment.billingInterval as PurchaseInterval;
  const periodEnd = computePeriodEnd(interval, now);

  await prisma.$transaction(async (tx) => {
    await tx.billingPayment.update({
      where: { id: payment.id },
      data: { status: "PAID", paidAt: now, gatewayResponseRaw: fetched.raw as object },
    });

    const subscription = await tx.subscription.update({
      where: { organizationId },
      data: {
        planId: payment.planId!,
        status: "ACTIVE",
        billingInterval: interval as BillingInterval,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
    });

    await tx.billingPayment.update({ where: { id: payment.id }, data: { subscriptionId: subscription.id } });

    await tx.organization.update({ where: { id: organizationId }, data: { status: "ACTIVE" } });
  });

  logger.info({ organizationId, billingPaymentId, interval }, "Subscription activated");
  return { status: "PAID" as const, alreadyProcessed: false };
}
