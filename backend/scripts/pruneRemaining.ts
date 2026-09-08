import { prisma } from "../src/config/prisma";

const KEEP_ORG_ID = "6acf3226-6d24-431b-b600-4adb8e8f5880"; // "Bhowmik's" - anupombhowmik81@gmail.com

async function main() {
  const orgs = await prisma.organization.findMany({
    where: { id: { not: KEEP_ORG_ID } },
    select: { id: true, nameEn: true },
  });

  console.log(`Deleting ${orgs.length} remaining organizations...`);
  const results: { id: string; nameEn: string; status: string }[] = [];

  for (const org of orgs) {
    try {
      // Payment.createdBy is required (not nullable) and RESTRICT-blocks deleting its user, so
      // clear payments for this org's users first - this org is being wiped entirely anyway.
      const userIds = (await prisma.user.findMany({ where: { organizationId: org.id }, select: { id: true } })).map((u) => u.id);
      await prisma.payment.deleteMany({ where: { createdBy: { in: userIds } } });
      await prisma.billingPayment.deleteMany({ where: { organizationId: org.id } });
      await prisma.subscription.deleteMany({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
      results.push({ id: org.id, nameEn: org.nameEn, status: "deleted" });
    } catch (err) {
      results.push({ id: org.id, nameEn: org.nameEn, status: `FAILED: ${(err as Error).message}` });
    }
  }

  console.log(JSON.stringify(results, null, 2));

  const remaining = await prisma.organization.findMany({ select: { id: true, nameEn: true } });
  const remainingUsers = await prisma.user.findMany({ select: { email: true, username: true } });
  console.log("Remaining orgs:", JSON.stringify(remaining, null, 2));
  console.log("Remaining users:", JSON.stringify(remainingUsers, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
