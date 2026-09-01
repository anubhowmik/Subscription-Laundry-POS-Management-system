import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { AppError, AuthorizationError, NotFoundError } from "../../utils/AppError";
import { getEntitlement } from "../billing/entitlement.service";
import { z } from "zod";
import { createUserSchema, updateUserSchema } from "./user.validators";

type CreateUserInput = z.infer<typeof createUserSchema>;
type UpdateUserInput = z.infer<typeof updateUserSchema>;

const SORTABLE_FIELDS = ["username", "fullNameEn", "createdAt"];

export async function list(query: Record<string, unknown>, organizationId: string) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "createdAt");

  const where: Prisma.UserWhereInput = {
    organizationId,
    deletedAt: null,
    ...(query.status ? { status: query.status as "ACTIVE" | "INACTIVE" } : {}),
    ...(query.roleId ? { roleId: String(query.roleId) } : {}),
    ...(query.businessLocationId
      ? { businessLocations: { some: { businessLocationId: String(query.businessLocationId) } } }
      : {}),
    ...(query.search
      ? {
          OR: [
            { username: { contains: String(query.search), mode: "insensitive" } },
            { fullNameEn: { contains: String(query.search), mode: "insensitive" } },
            { email: { contains: String(query.search), mode: "insensitive" } },
            { phone: { contains: String(query.search) } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        role: true,
        businessLocations: { include: { businessLocation: true } },
        customerRestrictions: { include: { customer: { select: { nameEn: true, nameAr: true } } } },
        customerGroupRestrictions: { include: { customerGroup: { select: { nameEn: true, nameAr: true } } } },
        transferFromLocationRestrictions: { include: { businessLocation: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { data: rows.map(({ passwordHash: _passwordHash, ...rest }) => rest), meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const user = await prisma.user.findFirst({
    where: { id, organizationId, deletedAt: null },
    include: {
      role: true,
      businessLocations: { include: { businessLocation: true } },
      customerRestrictions: { include: { customer: { select: { nameEn: true, nameAr: true } } } },
      customerGroupRestrictions: { include: { customerGroup: { select: { nameEn: true, nameAr: true } } } },
      transferFromLocationRestrictions: { include: { businessLocation: true } },
    },
  });
  if (!user) throw new NotFoundError("User not found");
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

async function assertRoleInOrg(roleId: string | undefined, organizationId: string) {
  if (!roleId) return;
  const role = await prisma.role.findFirst({ where: { id: roleId, organizationId } });
  if (!role) throw new AppError(400, "Role not found in this organization");
}

async function assertLocationsInOrg(businessLocationIds: string[] | undefined, organizationId: string) {
  if (!businessLocationIds || businessLocationIds.length === 0) return;
  const count = await prisma.businessLocation.count({ where: { id: { in: businessLocationIds }, organizationId } });
  if (count !== businessLocationIds.length) throw new AppError(400, "One or more business locations were not found in this organization");
}

async function assertCustomersInOrg(customerIds: string[] | undefined, organizationId: string) {
  if (!customerIds || customerIds.length === 0) return;
  const count = await prisma.customer.count({ where: { id: { in: customerIds }, organizationId } });
  if (count !== customerIds.length) throw new AppError(400, "One or more customers were not found in this organization");
}

async function assertCustomerGroupsInOrg(customerGroupIds: string[] | undefined, organizationId: string) {
  if (!customerGroupIds || customerGroupIds.length === 0) return;
  const count = await prisma.customerGroup.count({ where: { id: { in: customerGroupIds }, organizationId } });
  if (count !== customerGroupIds.length) throw new AppError(400, "One or more customer groups were not found in this organization");
}

/** The caller performing the change, used for privilege checks. */
export interface Actor {
  id: string;
  isSystemAdmin: boolean;
}

/**
 * `isSystemAdmin` bypasses per-branch scoping, so it is a privilege boundary, not an ordinary
 * field. Without this guard anyone holding `users.update` could set it on their own account and
 * grant themselves every branch in the organization.
 */
function resolveIsSystemAdmin(
  requested: boolean | undefined,
  actor: Actor,
  targetUserId: string | null,
): boolean | undefined {
  if (requested === undefined) return undefined;
  if (!actor.isSystemAdmin) {
    throw new AuthorizationError("Only a system admin can change system-admin status");
  }
  if (targetUserId !== null && targetUserId === actor.id) {
    throw new AuthorizationError("You cannot change your own system-admin status");
  }
  return requested;
}

/**
 * SECURITY: isSystemAdmin is a privilege boundary ABOVE ordinary role permissions - the built-in
 * "Admin" role is deliberately granted every permission code (see defaultRoles.ts, same as
 * "System Admin"), so a plain Admin can hold `users.update` / `users.reset_password` /
 * `users.deactivate` without being flagged isSystemAdmin at all. Without this guard, that Admin
 * could reset the real owner's password, demote their role, or deactivate their account outright -
 * a full privilege-escalation path. Only another isSystemAdmin may modify an isSystemAdmin target.
 * This is independent of resolveIsSystemAdmin() above, which only guards the isSystemAdmin FIELD
 * itself; this guards every OTHER field/action on a target who already has it.
 */
function assertCanModifyTarget(actor: Actor, target: { isSystemAdmin: boolean }) {
  if (target.isSystemAdmin && !actor.isSystemAdmin) {
    throw new AuthorizationError("Only a system admin can modify another system admin's account");
  }
}

/** Non-login placeholder accounts (allowLogin: false - "exists only to be referenced, e.g.
 * createdBy", see User.allowLogin in schema.prisma) don't count as a seat: they can't sign in, so
 * they aren't consuming anything the plan's maxUsers is actually metering. Deactivating a real
 * account frees its seat back up, same as deactivating a branch does for maxBranches. */
export async function countUsersTowardLimit(organizationId: string) {
  return prisma.user.count({ where: { organizationId, status: "ACTIVE", deletedAt: null, allowLogin: true } });
}

/** Shared by create(), update(), and setStatus() - call only at the specific transition that
 * actually grants a new login-capable seat (a fresh user, a placeholder gaining allowLogin, or a
 * deactivated user being reactivated); never on transitions that free a seat or don't touch one.
 *
 * Seats are metered against Organization.purchasedUserSeats (one included seat from the org's
 * own base subscription, plus one per one-time $10 seat purchase - see
 * billing.service.ts createSeatCheckout()), NOT Plan.maxUsers - that field is unused for seating
 * now that there's only a single Plan. During an active trial, seats are unlimited: the point of
 * the trial is to let the whole team evaluate the product, and no seat-purchase flow is even
 * reachable yet at that point (the org hasn't paid for its base subscription). */
async function assertUserSeatAvailable(organizationId: string) {
  const entitlement = await getEntitlement(organizationId);
  if (entitlement.isTrial && entitlement.hasAccess) return;

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { purchasedUserSeats: true },
  });
  const activeCount = await countUsersTowardLimit(organizationId);
  if (activeCount >= organization.purchasedUserSeats) {
    throw new AppError(
      403,
      `You have ${organization.purchasedUserSeats} purchased user seat${organization.purchasedUserSeats === 1 ? "" : "s"}, all in use. Buy another seat ($10 one-time) to add this user.`,
      undefined,
      "SEAT_LIMIT_REACHED",
    );
  }
}

export async function create(input: CreateUserInput, organizationId: string, actor: Actor) {
  const { password, businessLocationIds, customerIds, customerGroupIds, transferFromLocationIds, ...rest } = input;
  rest.isSystemAdmin = resolveIsSystemAdmin(rest.isSystemAdmin, actor, null);

  if (rest.allowLogin) await assertUserSeatAvailable(organizationId);

  await assertRoleInOrg(rest.roleId, organizationId);
  await assertLocationsInOrg(businessLocationIds, organizationId);
  await assertCustomersInOrg(customerIds, organizationId);
  await assertCustomerGroupsInOrg(customerGroupIds, organizationId);
  await assertLocationsInOrg(transferFromLocationIds, organizationId);
  const passwordHash = rest.allowLogin ? await bcrypt.hash(password!, 12) : null;

  return prisma.$transaction(async (tx) => {
    // emailVerified defaults to false on the schema, which is correct ONLY for the very first
    // admin user created by organization.service.ts registerOrganization() (who really does go
    // through the email verification flow). A staff user created here, from inside an
    // already-verified org by an already-authenticated admin, is vouched for by that admin and
    // must not be locked out of login just because nobody sent them a code - so it's explicitly
    // pre-verified.
    const user = await tx.user.create({ data: { ...rest, passwordHash, organizationId, emailVerified: true } });
    if (businessLocationIds.length > 0) {
      await tx.userBusinessLocation.createMany({
        data: businessLocationIds.map((businessLocationId) => ({ userId: user.id, businessLocationId })),
      });
    }
    if (customerIds && customerIds.length > 0) {
      await tx.userCustomer.createMany({ data: customerIds.map((customerId) => ({ userId: user.id, customerId })) });
    }
    if (customerGroupIds && customerGroupIds.length > 0) {
      await tx.userCustomerGroup.createMany({ data: customerGroupIds.map((customerGroupId) => ({ userId: user.id, customerGroupId })) });
    }
    if (transferFromLocationIds && transferFromLocationIds.length > 0) {
      await tx.userTransferFromLocation.createMany({
        data: transferFromLocationIds.map((businessLocationId) => ({ userId: user.id, businessLocationId })),
      });
    }
    const { passwordHash: _passwordHash, ...rest2 } = user;
    return rest2;
  });
}

export async function update(id: string, input: UpdateUserInput, organizationId: string, actor: Actor) {
  const existing = await getById(id, organizationId);
  assertCanModifyTarget(actor, existing);
  const { password, businessLocationIds, customerIds, customerGroupIds, transferFromLocationIds, ...rest } = input;
  rest.isSystemAdmin = resolveIsSystemAdmin(rest.isSystemAdmin, actor, id);

  // Only re-check the limit when this update newly grants login (false -> true) - that's the only
  // transition that consumes a fresh seat. A no-op (already true) or turning login off never blocks.
  const isNewlyGrantingLogin = rest.allowLogin === true && !existing.allowLogin;
  if (isNewlyGrantingLogin) await assertUserSeatAvailable(organizationId);

  await assertRoleInOrg(rest.roleId, organizationId);
  await assertLocationsInOrg(businessLocationIds, organizationId);
  await assertCustomersInOrg(customerIds, organizationId);
  await assertCustomerGroupsInOrg(customerGroupIds, organizationId);
  await assertLocationsInOrg(transferFromLocationIds, organizationId);

  // Switching to non-login revokes the ability to authenticate immediately (and any existing
  // sessions), same discipline as resetPassword(). Providing a new password re-hashes it,
  // regardless of the allowLogin direction, so re-enabling login and setting credentials can
  // happen in the same request.
  const data: Prisma.UserUncheckedUpdateInput = { ...rest };
  if (rest.allowLogin === false) data.passwordHash = null;
  if (password) data.passwordHash = await bcrypt.hash(password, 12);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id }, data });

    if (businessLocationIds) {
      await tx.userBusinessLocation.deleteMany({ where: { userId: id } });
      if (businessLocationIds.length > 0) {
        await tx.userBusinessLocation.createMany({
          data: businessLocationIds.map((businessLocationId) => ({ userId: id, businessLocationId })),
        });
      }
    }
    if (customerIds) {
      await tx.userCustomer.deleteMany({ where: { userId: id } });
      if (customerIds.length > 0) {
        await tx.userCustomer.createMany({ data: customerIds.map((customerId) => ({ userId: id, customerId })) });
      }
    }
    if (customerGroupIds) {
      await tx.userCustomerGroup.deleteMany({ where: { userId: id } });
      if (customerGroupIds.length > 0) {
        await tx.userCustomerGroup.createMany({ data: customerGroupIds.map((customerGroupId) => ({ userId: id, customerGroupId })) });
      }
    }
    if (transferFromLocationIds) {
      await tx.userTransferFromLocation.deleteMany({ where: { userId: id } });
      if (transferFromLocationIds.length > 0) {
        await tx.userTransferFromLocation.createMany({
          data: transferFromLocationIds.map((businessLocationId) => ({ userId: id, businessLocationId })),
        });
      }
    }

    if (rest.allowLogin === false) {
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }

    const { passwordHash: _passwordHash, ...rest2 } = user;
    return rest2;
  });
}

export async function setStatus(id: string, status: "ACTIVE" | "INACTIVE", organizationId: string, actor: Actor) {
  const existing = await getById(id, organizationId);
  assertCanModifyTarget(actor, existing);

  // Reactivating a login-capable user re-consumes a seat, same as creating one - only check on
  // that specific transition, never on deactivating (which always frees a seat) or on a user who
  // couldn't log in anyway.
  if (status === "ACTIVE" && existing.status === "INACTIVE" && existing.allowLogin) {
    await assertUserSeatAvailable(organizationId);
  }

  const user = await prisma.user.update({ where: { id }, data: { status } });
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

export interface AppAccessInput {
  appAccessPosLaundry: boolean | null;
  appAccessUsersRules: boolean | null;
  appAccessZatca: boolean | null;
}

/**
 * Sets a user's per-app "Application Access" overrides (see middleware/authenticate.ts, which
 * folds these onto the role's app.* grants at request time). Restricted to system admins only,
 * regardless of who holds users.update/app.users_rules: a force-grant override is a direct
 * privilege-escalation lever (it can hand a user access to an app their role never granted
 * them), so it gets the same isSystemAdmin-only bar as changing another system admin's account.
 */
export async function setAppAccess(id: string, input: AppAccessInput, organizationId: string, actor: Actor) {
  if (!actor.isSystemAdmin) {
    throw new AuthorizationError("Only a system admin can change a user's application access");
  }
  const existing = await getById(id, organizationId);
  assertCanModifyTarget(actor, existing);

  const user = await prisma.user.update({
    where: { id },
    data: {
      appAccessPosLaundry: input.appAccessPosLaundry,
      appAccessUsersRules: input.appAccessUsersRules,
      appAccessZatca: input.appAccessZatca,
    },
  });
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

export async function resetPassword(id: string, newPassword: string, organizationId: string, actor: Actor) {
  const existing = await getById(id, organizationId);
  assertCanModifyTarget(actor, existing);
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
}
