import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/AppError";

interface RoleInput {
  nameEn: string;
  nameAr: string;
  description?: string;
  permissionCodes: string[];
}

const SORTABLE_FIELDS = ["nameEn", "createdAt"];

export async function list(query: Record<string, unknown>, organizationId: string) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "nameEn");

  const [rows, total] = await Promise.all([
    prisma.role.findMany({
      where: { organizationId },
      orderBy,
      skip,
      take: limit,
      include: { _count: { select: { users: true } } },
    }),
    prisma.role.count({ where: { organizationId } }),
  ]);

  return { data: rows, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const role = await prisma.role.findFirst({
    where: { id, organizationId },
    include: { rolePermissions: { include: { permission: true } } },
  });
  if (!role) throw new NotFoundError("Role not found");
  return role;
}

async function resolvePermissionIds(codes: string[]) {
  const permissions = await prisma.permission.findMany({ where: { code: { in: codes } } });
  const found = new Set(permissions.map((p) => p.code));
  const missing = codes.filter((c) => !found.has(c));
  if (missing.length > 0) {
    throw new ValidationError([{ field: "permissionCodes", message: `Unknown permission code(s): ${missing.join(", ")}` }], "Invalid permission codes");
  }
  return permissions.map((p) => p.id);
}

export async function create(input: RoleInput, organizationId: string) {
  const permissionIds = await resolvePermissionIds(input.permissionCodes);

  const roleId = await prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: { organizationId, nameEn: input.nameEn, nameAr: input.nameAr, description: input.description },
    });
    if (permissionIds.length > 0) {
      await tx.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })) });
    }
    return role.id;
  });
  // Re-fetched with the module-level `prisma` client (not `tx`) after the transaction commits -
  // querying via `tx` inside the callback would work too, but `getById` is reused by every other
  // endpoint and must stay callable outside a transaction, so we fetch fresh here instead.
  return getById(roleId, organizationId);
}

export async function update(id: string, input: Partial<RoleInput>, organizationId: string) {
  const role = await getById(id, organizationId);
  if (role.isSystem) throw new ConflictError("Cannot modify a system role");

  await prisma.$transaction(async (tx) => {
    await tx.role.update({
      where: { id },
      data: { nameEn: input.nameEn, nameAr: input.nameAr, description: input.description },
    });

    if (input.permissionCodes) {
      const permissionIds = await resolvePermissionIds(input.permissionCodes);
      const existing = await tx.rolePermission.findMany({ where: { roleId: id } });
      const existingIds = new Set(existing.map((rp) => rp.permissionId));
      const nextIds = new Set(permissionIds);

      const toAdd = permissionIds.filter((pid) => !existingIds.has(pid));
      const toRemove = [...existingIds].filter((pid) => !nextIds.has(pid));

      if (toAdd.length > 0) {
        await tx.rolePermission.createMany({ data: toAdd.map((permissionId) => ({ roleId: id, permissionId })) });
      }
      if (toRemove.length > 0) {
        await tx.rolePermission.deleteMany({ where: { roleId: id, permissionId: { in: toRemove } } });
      }
    }
  });
  // Fetched with the module-level `prisma` client after the transaction commits - see create().
  return getById(id, organizationId);
}

export async function remove(id: string, organizationId: string) {
  const role = await getById(id, organizationId);
  if (role.isSystem) throw new ConflictError("Cannot delete a system role");

  const userCount = await prisma.user.count({ where: { roleId: id } });
  if (userCount > 0) throw new ConflictError("Cannot delete a role that still has users assigned to it");

  await prisma.role.delete({ where: { id } });
}
