/**
 * Creates persistent qa_* test accounts, one per built-in role, for the end-to-end role audit.
 * Idempotent - safe to re-run. All accounts live in org "aa" and are assigned to the Riyadh
 * branch (MAIN) so pos.access-gated flows work. Password is uniform for convenience during the
 * audit: QaTest123!@#456
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const PASSWORD = "QaTest123!@#456";

const ROLE_TO_USERNAME: Record<string, string> = {
  "System Admin": "qa_systemadmin",
  "Admin": "qa_admin",
  "Store Manager": "qa_storemanager",
  "Manager Assistant": "qa_managerassistant",
  "Accountant": "qa_accountant",
  "Cashier": "qa_cashier",
  "Inventory Keeper": "qa_inventorykeeper",
  "Call Center": "qa_callcenter",
  "Data Entry": "qa_dataentry",
  "Factory": "qa_factory",
  "Factory Compensation": "qa_factorycompensation",
  "Sales Commission Agent": "qa_salescommissionagent",
  "User": "qa_user",
};

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: "aa" } });
  if (!org) throw new Error('Org "aa" not found');
  const mainBranch = await prisma.businessLocation.findFirst({ where: { organizationId: org.id, branchCode: "MAIN" } });
  if (!mainBranch) throw new Error("MAIN branch not found");

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const created: { username: string; role: string; isSystemAdmin: boolean }[] = [];

  for (const [roleName, username] of Object.entries(ROLE_TO_USERNAME)) {
    const role = await prisma.role.findFirst({ where: { organizationId: org.id, nameEn: roleName } });
    if (!role) {
      console.warn(`Role "${roleName}" not found - skipping ${username}`);
      continue;
    }
    const isSystemAdmin = roleName === "System Admin";
    const user = await prisma.user.upsert({
      where: { username },
      update: { passwordHash, roleId: role.id, isSystemAdmin, status: "ACTIVE", allowLogin: true, deletedAt: null },
      create: {
        organizationId: org.id,
        username,
        email: `${username}@qa.example.com`,
        passwordHash,
        fullNameEn: `QA ${roleName}`,
        fullNameAr: `QA ${roleName}`,
        roleId: role.id,
        isSystemAdmin,
      },
    });
    await prisma.userBusinessLocation.upsert({
      where: { userId_businessLocationId: { userId: user.id, businessLocationId: mainBranch.id } },
      update: {},
      create: { userId: user.id, businessLocationId: mainBranch.id },
    });
    created.push({ username, role: roleName, isSystemAdmin });
  }

  console.log(JSON.stringify({ orgId: org.id, orgSlug: org.slug, mainBranchId: mainBranch.id, password: PASSWORD, accounts: created }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
