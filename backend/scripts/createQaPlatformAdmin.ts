import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();
async function main() {
  const passwordHash = await bcrypt.hash("QaPlatform123!@#456", 12);
  await prisma.platformAdmin.upsert({
    where: { username: "qa_platformadmin" },
    update: { passwordHash, status: "ACTIVE" },
    create: { username: "qa_platformadmin", email: "qa_platformadmin@qa.example.com", passwordHash, fullName: "QA Platform Admin" },
  });
  console.log("qa_platformadmin ready");
}
main().finally(() => prisma.$disconnect());
