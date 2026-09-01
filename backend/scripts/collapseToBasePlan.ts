/**
 * One-off migration: collapses the old Starter/Pro/Enterprise tiers down to the single "base"
 * plan (see config/plans.ts) that replaces them under the new per-seat licensing model.
 *
 * Upserts the new "base" plan (source of truth: config/plans.ts), deactivates the three old
 * tiers (never deleted - BillingPayment.planId still points at them for historical payments),
 * and re-points every existing Subscription from an old tier onto "base" so no org's access
 * changes as a result of this migration.
 *
 * Also backfills Organization.purchasedUserSeats for every existing org to
 * GREATEST(1, active-login-user-count) rather than leaving it at the column's naive default of
 * 1 - otherwise any org with more than one active, login-capable user today would instantly be
 * "over" its new seat limit and unable to reactivate/add anyone until buying more seats it
 * already effectively had under the old plan.maxUsers model.
 *
 * Idempotent - safe to re-run. Usage: npx tsx scripts/collapseToBasePlan.ts
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
  const basePlan = await prisma.plan.findUniqueOrThrow({ where: { code: PLAN_DEFS[0].code } });
  console.log(`Ensured "${basePlan.code}" plan exists and is active.`);

  const oldTierCodes = ["starter", "pro", "enterprise"];
  const oldTiers = await prisma.plan.findMany({ where: { code: { in: oldTierCodes } } });

  for (const oldPlan of oldTiers) {
    const affected = await prisma.subscription.updateMany({
      where: { planId: oldPlan.id },
      data: { planId: basePlan.id },
    });
    if (affected.count > 0) {
      console.log(`Moved ${affected.count} subscription(s) from "${oldPlan.code}" to "${basePlan.code}" (grandfathered, unaffected access).`);
    }
    await prisma.plan.update({ where: { id: oldPlan.id }, data: { isActive: false } });
  }
  if (oldTiers.length > 0) {
    console.log(`Deactivated legacy plan(s): ${oldTiers.map((p) => p.code).join(", ")} - existing payment history stays intact.`);
  } else {
    console.log("No legacy tiered plans found - nothing to deactivate.");
  }

  const orgs = await prisma.organization.findMany({ select: { id: true, slug: true, purchasedUserSeats: true } });
  let backfilled = 0;
  for (const org of orgs) {
    const activeSeatCount = await prisma.user.count({
      where: { organizationId: org.id, status: "ACTIVE", deletedAt: null, allowLogin: true },
    });
    const seats = Math.max(1, activeSeatCount);
    if (seats !== org.purchasedUserSeats) {
      await prisma.organization.update({ where: { id: org.id }, data: { purchasedUserSeats: seats } });
      backfilled++;
      console.log(`  ${org.slug}: purchasedUserSeats ${org.purchasedUserSeats} -> ${seats} (active login users: ${activeSeatCount})`);
    }
  }
  console.log(`Backfilled purchasedUserSeats for ${backfilled} of ${orgs.length} organization(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
