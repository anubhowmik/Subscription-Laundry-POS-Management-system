/**
 * One-off backfill: grants the new bnpl.manage permission code to existing organizations' roles,
 * per ROLE_DEFS. Needed because roles are only granted their permission set at signup time - orgs
 * created before this code existed never got it. Mirrors backfillPurchasingPermissions.ts.
 *
 * Usage: npx tsx scripts/backfillBnplPermission.ts <org-slug>
 */

import { PrismaClient } from "@prisma/client";
import { ROLE_DEFS } from "../src/config/defaultRoles";
import { PERMISSIONS } from "../src/config/permissions";

const prisma = new PrismaClient();

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npx tsx scripts/backfillBnplPermission.ts <org-slug>");
    process.exit(1);
  }

  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) {
    console.error(`No organization with slug "${slug}"`);
    process.exit(1);
  }

  const newCodes = ["bnpl.manage"];
  await prisma.permission.createMany({
    data: PERMISSIONS.filter((p) => newCodes.includes(p.code)),
    skipDuplicates: true,
  });
  const permissions = await prisma.permission.findMany({ where: { code: { in: newCodes } } });

  for (const roleDef of ROLE_DEFS) {
    const role = await prisma.role.findUnique({
      where: { organizationId_nameEn: { organizationId: org.id, nameEn: roleDef.nameEn } },
    });
    if (!role) continue;

    const codesToGrant =
      roleDef.permissions === "ALL" ? newCodes : newCodes.filter((c) => roleDef.permissions.includes(c));
    if (codesToGrant.length === 0) continue;

    const rows = permissions
      .filter((p) => codesToGrant.includes(p.code))
      .map((p) => ({ roleId: role.id, permissionId: p.id }));

    await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true });
    console.log(`Granted [${codesToGrant.join(", ")}] to "${roleDef.nameEn}"`);
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
