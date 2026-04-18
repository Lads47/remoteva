import prisma from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";

async function main() {
  const email = "test@admin.local";
  const password = "test1234";
  const passwordHash = await hashPassword(password);

  await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  });
  console.log("Admin créé/mis à jour:");
  console.log("  email   :", email);
  console.log("  password:", password);
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
