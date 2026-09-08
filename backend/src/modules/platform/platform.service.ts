import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma";
import { AppError, NotFoundError } from "../../utils/AppError";
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
      // Filtered to match exactly what actually counts against the plan's limits (see
      // businessLocation.service.ts's countBranchesTowardLimit and user.service.ts's
      // countUsersTowardLimit) - an unfiltered count would show numbers the operator could read
      // as "this company is over its limit" when deactivated/non-login rows are why it isn't.
      _count: {
        select: {
          users: { where: { status: "ACTIVE", deletedAt: null, allowLogin: true } },
          businessLocations: { where: { status: "ACTIVE" } },
        },
      },
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
      maxBranches: org.subscription?.plan.maxBranches ?? null,
      maxUsers: org.subscription?.plan.maxUsers ?? null,
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

// User account metadata only - email, verification/login status, role name. Never anything from
// the tenant's own business tables, per the module-level constraint above.
export async function listOrganizationUsers(organizationId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!org) throw new NotFoundError("Organization not found");

  const users = await prisma.user.findMany({
    where: { organizationId },
    select: {
      id: true,
      fullNameEn: true,
      fullNameAr: true,
      username: true,
      email: true,
      emailVerified: true,
      status: true,
      allowLogin: true,
      isSystemAdmin: true,
      lastLoginAt: true,
      createdAt: true,
      deletedAt: true,
      role: { select: { nameEn: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return users.map((u) => ({
    id: u.id,
    fullNameEn: u.fullNameEn,
    fullNameAr: u.fullNameAr,
    username: u.username,
    email: u.email,
    emailVerified: u.emailVerified,
    status: u.status,
    allowLogin: u.allowLogin,
    isSystemAdmin: u.isSystemAdmin,
    roleNameEn: u.role.nameEn,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    deletedAt: u.deletedAt,
  }));
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
    // null for SEAT_LICENSE payments, which aren't tied to a plan - see BillingPaymentPurpose.
    planCode: p.plan?.code ?? null,
    purpose: p.purpose,
    seatQuantity: p.seatQuantity,
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

// ---------------------------------------------------------------------------
// Platform admins - who is allowed into this console at all.
//
// Creating the FIRST platform admin still requires shell access (scripts/createPlatformAdmin.ts) -
// there is no bootstrap-from-nothing endpoint, since that would mean an unauthenticated way to
// mint the platform's highest-privilege account. Once at least one admin exists, they can invite
// more from here. Every admin has equal, full access, with exactly one exception: the admin
// flagged isOwner cannot be deactivated or have their password reset by any OTHER admin (they can
// still do both to themselves, and can do either to every non-owner admin) - added specifically so
// adding a second admin can never mean handing them the ability to lock the owner out.
// ---------------------------------------------------------------------------

function toSafeAdmin<T extends { passwordHash: string }>(admin: T): Omit<T, "passwordHash"> {
  const { passwordHash: _passwordHash, ...rest } = admin;
  return rest;
}

export async function listAdmins() {
  const admins = await prisma.platformAdmin.findMany({ orderBy: { createdAt: "asc" } });
  return admins.map(toSafeAdmin);
}

export async function createAdmin(input: { username: string; email: string; fullName: string; password: string }) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  const admin = await prisma.platformAdmin.create({
    data: { username: input.username, email: input.email.toLowerCase(), fullName: input.fullName, passwordHash },
  });
  return toSafeAdmin(admin);
}

async function assertNotLastActiveAdmin(targetId: string) {
  const activeCount = await prisma.platformAdmin.count({ where: { status: "ACTIVE" } });
  const target = await prisma.platformAdmin.findUnique({ where: { id: targetId } });
  if (target?.status === "ACTIVE" && activeCount <= 1) {
    throw new AppError(400, "Cannot deactivate the last remaining platform admin - it would lock everyone out of the console.");
  }
}

export async function setAdminStatus(id: string, status: "ACTIVE" | "INACTIVE", actingAdminId: string) {
  const admin = await prisma.platformAdmin.findUnique({ where: { id } });
  if (!admin) throw new NotFoundError("Platform admin not found");

  if (id === actingAdminId) {
    if (status === "INACTIVE") throw new AppError(400, "You cannot deactivate your own account");
  } else {
    // Changing ANOTHER admin's status (deactivate or reactivate) is owner-only, same restriction
    // as resetting another admin's password - a non-owner admin cannot touch any other admin's
    // status at all, which also means they can never reach the owner specifically.
    const actingAdmin = await prisma.platformAdmin.findUnique({ where: { id: actingAdminId } });
    if (!actingAdmin?.isOwner) {
      throw new AppError(403, "Only the owner can change another admin's status");
    }
  }

  if (status === "INACTIVE") {
    await assertNotLastActiveAdmin(id);
  }

  const updated = await prisma.platformAdmin.update({ where: { id }, data: { status } });

  // Deactivating must also kill live sessions, same discipline as suspending a tenant org.
  if (status === "INACTIVE") {
    await prisma.platformRefreshToken.updateMany({ where: { platformAdminId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  return toSafeAdmin(updated);
}

export async function resetAdminPassword(id: string, newPassword: string, actingAdminId: string, currentPassword?: string) {
  const admin = await prisma.platformAdmin.findUnique({ where: { id } });
  if (!admin) throw new NotFoundError("Platform admin not found");

  if (id === actingAdminId) {
    // Changing your OWN password (self-service) must prove you still know the current one - same
    // discipline as a tenant user's change-password flow (auth.service.ts changePassword()).
    const matches = currentPassword ? await bcrypt.compare(currentPassword, admin.passwordHash) : false;
    if (!matches) throw new AppError(400, "Current password is incorrect");
  } else {
    // Resetting someone ELSE's password is an administrative override - restricted to the owner
    // only. A non-owner admin can never touch another admin's password, owner or not, only their
    // own (with the current-password proof above) - keeps "only the owner can reset others"
    // symmetric with "only the owner is protected from being reset by others".
    const actingAdmin = await prisma.platformAdmin.findUnique({ where: { id: actingAdminId } });
    if (!actingAdmin?.isOwner) {
      throw new AppError(403, "Only the owner can reset another admin's password");
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.platformAdmin.update({ where: { id }, data: { passwordHash } });
  // Force re-login everywhere, same as a tenant user's password reset.
  await prisma.platformRefreshToken.updateMany({ where: { platformAdminId: id, revokedAt: null }, data: { revokedAt: new Date() } });
}
