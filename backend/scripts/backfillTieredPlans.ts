/**
 * One-off migration: (re)introduces the Starter/Pro/Enterprise tiers (see config/plans.ts).
 *
 * This database already had starter/pro/enterprise Plan rows from an earlier phase of the
 * project, deactivated when it was collapsed down to a single "standard" plan - with different
 * placeholder prices than config/plans.ts now defines. Upserting (not createMany+skipDuplicates)
 * makes config/plans.ts the real source of truth: it reactivates and syncs those old rows rather
 * than silently leaving stale numbers in place, and still works correctly on a database that
 * never had them at all.
 *
 * Also deactivates the "standard" plan (never deleted - BillingPayment.planId is a required FK,
 * so old payment history must keep pointing at a real row) and grandfathers every organization
 * currently on it onto Enterprise (unlimited), so nobody's access changes as a result of this.
 *
 * Usage: npx tsx scripts/backfillTieredPlans.ts
 */

import { PrismaClient } from "@prisma/client";
import { PLAN_DEFS } from "../src/config/plans";

const prisma = new PrismaClient();

async function main() {
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
        isActive: true,
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
  console.log(`Ensured plans exist and are active: ${PLAN_DEFS.map((p) => p.code).join(", ")}`);

  const oldPlan = await prisma.plan.findUnique({ where: { code: "standard" } });
  if (!oldPlan) {
    console.log('No legacy "standard" plan found - nothing to migrate.');
    return;
  }

  const enterprisePlan = await prisma.plan.findUniqueOrThrow({ where: { code: "enterprise" } });

  const affected = await prisma.subscription.updateMany({
    where: { planId: oldPlan.id },
    data: { planId: enterprisePlan.id },
  });
  console.log(`Moved ${affected.count} subscription(s) from "standard" to "enterprise" (grandfathered, unaffected access).`);

  await prisma.plan.update({ where: { id: oldPlan.id }, data: { isActive: false } });
  console.log('Deactivated the legacy "standard" plan - existing payment history stays intact, it just no longer appears in the plan picker.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
