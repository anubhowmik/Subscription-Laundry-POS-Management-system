import { Plan, Subscription } from "@prisma/client";
import { prisma } from "../../config/prisma";

/**
 * Single source of truth for "is this organization allowed to use the product right now".
 *
 * Access is computed from DATES on every call, never from a status flag alone. That means no
 * background job is needed to expire anything - the moment currentPeriodEnd is in the past, the
 * next request stops being entitled. `Subscription.status` is descriptive metadata for the UI.
 */

export type EntitlementReason =
  | "TRIAL_ACTIVE"
  | "SUBSCRIPTION_ACTIVE"
  | "LIFETIME"
  | "TRIAL_EXPIRED"
  | "SUBSCRIPTION_EXPIRED"
  | "NO_SUBSCRIPTION"
  | "ORGANIZATION_INACTIVE";

export interface Entitlement {
  hasAccess: boolean;
  reason: EntitlementReason;
  isTrial: boolean;
  /** Whole days remaining, rounded up. Null when not on a trial. 0 means "expires today". */
  trialDaysLeft: number | null;
  /** Null for lifetime subscriptions, which never expire. */
  expiresAt: Date | null;
  organizationStatus: string;
  subscription: {
    id: string;
    status: string;
    billingInterval: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  plan: {
    id: string;
    code: string;
    nameEn: string;
    nameAr: string;
    maxBranches: number | null;
    maxUsers: number | null;
  } | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysUntil(date: Date, now: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / MS_PER_DAY));
}

/** Subscription joined with its plan - the shape both callers already have loaded. */
export type SubscriptionWithPlan = (Subscription & { plan: Plan }) | null;

export async function getEntitlement(organizationId: string, now = new Date()): Promise<Entitlement> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { subscription: { include: { plan: true } } },
  });
  return computeEntitlement(organization?.status ?? null, organization?.subscription ?? null, now);
}

/**
 * Pure entitlement logic over already-loaded rows. The platform console lists every company at
 * once and calls this directly, so listing N companies stays a single query instead of N+1.
 */
export function computeEntitlement(
  organizationStatus: string | null,
  organizationSubscription: SubscriptionWithPlan,
  now = new Date(),
): Entitlement {
  const organization = organizationStatus === null ? null : { status: organizationStatus, subscription: organizationSubscription };

  const base = {
    isTrial: false,
    trialDaysLeft: null,
    expiresAt: null,
    organizationStatus: organization?.status ?? "UNKNOWN",
    subscription: null,
    plan: null,
  } satisfies Omit<Entitlement, "hasAccess" | "reason">;

  if (!organization) {
    return { ...base, hasAccess: false, reason: "ORGANIZATION_INACTIVE" };
  }
  if (organization.status === "SUSPENDED" || organization.status === "CANCELLED") {
    return { ...base, hasAccess: false, reason: "ORGANIZATION_INACTIVE" };
  }

  const sub = organization.subscription;
  if (!sub) {
    return { ...base, hasAccess: false, reason: "NO_SUBSCRIPTION" };
  }

  const subShape = {
    id: sub.id,
    status: sub.status,
    billingInterval: sub.billingInterval,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
  const planShape = {
    id: sub.plan.id,
    code: sub.plan.code,
    nameEn: sub.plan.nameEn,
    nameAr: sub.plan.nameAr,
    maxBranches: sub.plan.maxBranches,
    maxUsers: sub.plan.maxUsers,
  };
  const withSub = { ...base, organizationStatus: organization.status, subscription: subShape, plan: planShape };

  // Lifetime: paid once, never expires. currentPeriodEnd is null by design.
  if (sub.billingInterval === "LIFETIME") {
    return sub.status === "ACTIVE"
      ? { ...withSub, hasAccess: true, reason: "LIFETIME", expiresAt: null }
      // A lifetime purchase that was refunded or revoked. It existed, so report it as expired
      // rather than NO_SUBSCRIPTION, which would wrongly tell them they never bought anything.
      : { ...withSub, hasAccess: false, reason: "SUBSCRIPTION_EXPIRED", expiresAt: null };
  }

  // Everything else is period-bound and needs a real end date to be valid.
  const periodEnd = sub.currentPeriodEnd;
  if (!periodEnd) {
    return { ...withSub, hasAccess: false, reason: "NO_SUBSCRIPTION" };
  }

  const stillWithinPeriod = periodEnd.getTime() > now.getTime();

  if (sub.status === "TRIALING") {
    return {
      ...withSub,
      hasAccess: stillWithinPeriod,
      reason: stillWithinPeriod ? "TRIAL_ACTIVE" : "TRIAL_EXPIRED",
      isTrial: true,
      trialDaysLeft: stillWithinPeriod ? daysUntil(periodEnd, now) : 0,
      expiresAt: periodEnd,
    };
  }

  // ACTIVE, or CANCELLED but still paid through the end of the current period.
  if (sub.status === "ACTIVE" || sub.status === "CANCELLED") {
    return {
      ...withSub,
      hasAccess: stillWithinPeriod,
      reason: stillWithinPeriod ? "SUBSCRIPTION_ACTIVE" : "SUBSCRIPTION_EXPIRED",
      expiresAt: periodEnd,
    };
  }

  // PAST_DUE - a renewal charge failed. No access until they pay.
  return { ...withSub, hasAccess: false, reason: "SUBSCRIPTION_EXPIRED", expiresAt: periodEnd };
}
