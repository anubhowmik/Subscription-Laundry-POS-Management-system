// Global-only seed. Per-organization data (roles, default master data, admin user) is created
// at signup time via POST /api/organizations/register - see
// src/modules/organizations/organization.service.ts. This script just seeds the two catalogs
// that are NOT tenant-scoped: the Permission catalog and the Plan catalog.

import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/config/permissions";
import { PLAN_DEFS } from "../src/config/plans";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding permissions...");
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, description: p.description },
      create: p,
    });
  }

  console.log("Seeding plans...");
  for (const p of PLAN_DEFS) {
    await prisma.plan.upsert({
      where: { code: p.code },
      update: {
        nameEn: p.nameEn,
        nameAr: p.nameAr,
        priceMonthly: p.priceMonthly,
        priceAnnual: p.priceAnnual,
        priceLifetime: p.priceLifetime,
        maxBranches: p.maxBranches,
        maxUsers: p.maxUsers,
      },
      create: {
        code: p.code,
        nameEn: p.nameEn,
        nameAr: p.nameAr,
        priceMonthly: p.priceMonthly,
        priceAnnual: p.priceAnnual,
        priceLifetime: p.priceLifetime,
        maxBranches: p.maxBranches,
        maxUsers: p.maxUsers,
      },
    });
  }

  // Any plan no longer in the catalog is deactivated rather than deleted - past subscriptions
  // and BillingPayment rows still reference it, and that billing history must stay intact.
  const catalogCodes = PLAN_DEFS.map((p) => p.code);
  const retired = await prisma.plan.updateMany({
    where: { code: { notIn: catalogCodes }, isActive: true },
    data: { isActive: false },
  });
  if (retired.count > 0) console.log(`Deactivated ${retired.count} plan(s) no longer in the catalog.`);

  console.log("Global seed complete. Register an organization via POST /api/organizations/register to create a tenant.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
