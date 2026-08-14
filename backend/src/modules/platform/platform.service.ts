import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/AppError";
import { computeEntitlement } from "../billing/entitlement.service";

/**
 * Platform operator views over the whole database.
 *
 * DELIBERATE CONSTRAINT: nothing here may return a tenant's business data - no customers, no
 * sales, no invoices, no products. The operator sees only account metadata (who registered,
 * what they pay, whether they are active). This was an explicit product decision, and it keeps
 * the operator account out of scope for the customers' ZATCA-regulated invoice records.
 */

export async function listOrganizations(query: Record<string, unknown>) {
  const search = query.search ? String(query.search).trim() : "";
  const status = query.status ? String(query.status) : "";

  const organizations = await prisma.organization.findMany({
    where: {
      ...(status ? { status: status as "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED" } : {}),
      ...(search
        ? {
            OR: [
              { nameEn: { contains: search, mode: "insensitive" } },
              { nameAr: { contains: search } },
              { slug: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      subscription: { include: { plan: true } },
      _count: { select: { users: true, businessLocations: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  return organizations.map((org) => {
    const entitlement = computeEntitlement(org.status, org.subscription, now);
    return {
      id: org.id,
      nameEn: org.nameEn,
      nameAr: org.nameAr,
      slug: org.slug,
      status: org.status,
      createdAt: org.createdAt,
      userCount: org._count.users,
      branchCount: org._count.businessLocations,
      planCode: org.subscription?.plan.code ?? null,
      planNameEn: org.subscription?.plan.nameEn ?? null,
      billingInterval: org.subscription?.billingInterval ?? null,
      subscriptionStatus: org.subscription?.status ?? null,
      hasAccess: entitlement.hasAccess,
      accessReason: entitlement.reason,
      isTrial: entitlement.isTrial,
      trialDaysLeft: entitlement.trialDaysLeft,
      expiresAt: entitlement.expiresAt,
    };
  });
}

export async function setOrganizationStatus(organizationId: string, status: "ACTIVE" | "SUSPENDED") {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw new NotFoundError("Organization not found");

  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: { status },
    select: { id: true, nameEn: true, slug: true, status: true },
  });

  // Suspending must also kill live sessions. Access tokens are short-lived, but without
  // revoking refresh tokens a suspended company could keep minting new ones for days.
  if (status === "SUSPENDED") {
    await prisma.refreshToken.updateMany({
      where: { user: { organizationId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  return updated;
}

export async function listPayments(query: Record<string, unknown>) {
  const status = query.status ? String(query.status) : "";

  const payments = await prisma.billingPayment.findMany({
    where: { ...(status ? { status: status as "PENDING" | "PAID" | "FAILED" | "REFUNDED" } : {}) },
    include: {
      organization: { select: { id: true, nameEn: true, slug: true } },
      plan: { select: { code: true, nameEn: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return payments.map((p) => ({
    id: p.id,
    organizationId: p.organizationId,
    organizationName: p.organization.nameEn,
    organizationSlug: p.organization.slug,
    planCode: p.plan.code,
    amount: p.amount,
    currency: p.currency,
    billingInterval: p.billingInterval,
    status: p.status,
    gateway: p.gateway,
    gatewayPaymentId: p.gatewayPaymentId,
    failureReason: p.failureReason,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
  }));
}

export async function getStats() {
  const [totalOrganizations, activeOrganizations, suspendedOrganizations, paidAgg] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({ where: { status: { in: ["TRIAL", "ACTIVE"] } } }),
    prisma.organization.count({ where: { status: "SUSPENDED" } }),
    prisma.billingPayment.aggregate({ where: { status: "PAID" }, _sum: { amount: true }, _count: true }),
  ]);

  return {
    totalOrganizations,
    activeOrganizations,
    suspendedOrganizations,
    paidPaymentCount: paidAgg._count,
    totalRevenue: paidAgg._sum.amount ?? 0,
  };
}
