/**
 * Reconciles every organization's built-in roles against the canonical definitions in
 * defaultRoles.ts - adds missing grants AND removes stale/extra ones. Found necessary during a
 * role-based security audit: several orgs' roles had drifted from the current code (a leftover
 * "pos.register.manage" grant on 8 roles that should never have it, and a stale pre-P8-6
 * "compensations.manage" code on Store Manager/Factory Compensation instead of the current
 * granular compensations.file/approve/pay/view_own/view_all - meaning those roles currently have
 * NO real access to compensation endpoints at all despite the role definition intending it).
 *
 * Skips roles with no matching ROLE_DEFS entry (custom/renamed roles) and leaves "ALL"-scoped
 * roles (System Admin, Admin) untouched beyond ensuring they have every current permission - it
 * never removes from an ALL-scoped role, since "ALL" always means "whatever exists today".
 *
 * Idempotent - safe to re-run. Usage: npx tsx scripts/syncRolePermissions.ts
 */
import { prisma } from "../src/config/prisma";
import { PERMISSIONS } from "../src/config/permissions";
import { ROLE_DEFS } from "../src/config/defaultRoles";

async function main() {
  const createdPerms = await prisma.permission.createMany({ data: PERMISSIONS, skipDuplicates: true });
  console.log(`Ensured Permission catalog: inserted ${createdPerms.count} new row(s)`);

  const allPermissions = await prisma.permission.findMany();
  const permByCode = new Map(allPermissions.map((p) => [p.code, p]));

  const roles = await prisma.role.findMany({ include: { rolePermissions: true } });

  for (const role of roles) {
    const def = ROLE_DEFS.find((r) => r.nameEn === role.nameEn);
    if (!def) continue; // custom/legacy role - not ours to touch

    const currentPermissionIds = new Set(role.rolePermissions.map((rp) => rp.permissionId));

    if (def.permissions === "ALL") {
      const toGrant = allPermissions.filter((p) => !currentPermissionIds.has(p.id));
      if (toGrant.length > 0) {
        await prisma.rolePermission.createMany({
          data: toGrant.map((p) => ({ roleId: role.id, permissionId: p.id })),
          skipDuplicates: true,
        });
        console.log(`${role.nameEn} (${role.id}): granted ${toGrant.length} missing permission(s)`);
      }
      continue;
    }

    const desiredIds = new Set(def.permissions.map((code) => permByCode.get(code)?.id).filter((id): id is string => Boolean(id)));
    const toAdd = [...desiredIds].filter((id) => !currentPermissionIds.has(id));
    const toRemove = [...currentPermissionIds].filter((id) => !desiredIds.has(id));

    if (toAdd.length > 0) {
      await prisma.rolePermission.createMany({
        data: toAdd.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
    if (toRemove.length > 0) {
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: { in: toRemove } } });
    }
    if (toAdd.length > 0 || toRemove.length > 0) {
      console.log(`${role.nameEn} (org ${role.organizationId}): +${toAdd.length} -${toRemove.length}`);
    }
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
