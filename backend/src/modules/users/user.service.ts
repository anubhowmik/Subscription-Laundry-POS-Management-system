import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { AppError, AuthorizationError, NotFoundError } from "../../utils/AppError";
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

export async function create(input: CreateUserInput, organizationId: string, actor: Actor) {
  const { password, businessLocationIds, customerIds, customerGroupIds, transferFromLocationIds, ...rest } = input;
  rest.isSystemAdmin = resolveIsSystemAdmin(rest.isSystemAdmin, actor, null);
  await assertRoleInOrg(rest.roleId, organizationId);
  await assertLocationsInOrg(businessLocationIds, organizationId);
  await assertCustomersInOrg(customerIds, organizationId);
  await assertCustomerGroupsInOrg(customerGroupIds, organizationId);
  await assertLocationsInOrg(transferFromLocationIds, organizationId);
  const passwordHash = rest.allowLogin ? await bcrypt.hash(password!, 12) : null;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { ...rest, passwordHash, organizationId } });
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
  await getById(id, organizationId);
  const { password, businessLocationIds, customerIds, customerGroupIds, transferFromLocationIds, ...rest } = input;
  rest.isSystemAdmin = resolveIsSystemAdmin(rest.isSystemAdmin, actor, id);
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

export async function setStatus(id: string, status: "ACTIVE" | "INACTIVE", organizationId: string) {
  await getById(id, organizationId);
  const user = await prisma.user.update({ where: { id }, data: { status } });
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

export async function resetPassword(id: string, newPassword: string, organizationId: string) {
  await getById(id, organizationId);
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
}
