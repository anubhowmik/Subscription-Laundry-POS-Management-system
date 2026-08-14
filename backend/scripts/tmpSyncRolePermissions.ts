import { prisma } from "../src/config/prisma";
import { PERMISSIONS } from "../src/config/permissions";
import { ROLE_DEFS } from "../src/config/defaultRoles";

async function main() {
  const created = await prisma.permission.createMany({ data: PERMISSIONS, skipDuplicates: true });
  console.log(`inserted ${created.count} new Permission row(s)`);

  // Re-syncs every ALL-scoped role (System Admin, Admin) against the full current PERMISSIONS
  // list, not just this item's new codes - safe/idempotent (skipDuplicates) and saves re-running
  // this script by hand for every subsequent Tier 3 item that adds its own new permission codes.
  const allPermissions = await prisma.permission.findMany();
  const allRoleNames = ROLE_DEFS.filter((r) => r.permissions === "ALL").map((r) => r.nameEn);
  const rolesToGrant = await prisma.role.findMany({ where: { nameEn: { in: allRoleNames } } });

  const rows = rolesToGrant.flatMap((role) => allPermissions.map((p) => ({ roleId: role.id, permissionId: p.id })));
  const granted = await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true });
  console.log(`granted ${granted.count} role-permission row(s) across ${rolesToGrant.length} role(s)`);
}

main().then(() => prisma.$disconnect());
