import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";
import path from "path";

// Script de création du super-administrateur initial (Phase 4 EVA).
// Usage : npx tsx scripts/seed.ts
//
// Crée (ou met à jour) un compte super-admin validé avec accès à tous les
// univers. À utiliser uniquement pour bootstraper un environnement de dev
// ou une nouvelle instance — JAMAIS en production.

const dbPath = path.join(process.cwd(), "data", "remoteva.db");
const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

const DEFAULT_EMAIL = "admin@eva.local";
const DEFAULT_PASSWORD = "ChangeMe!123"; // À changer immédiatement

async function main() {
  console.log("Seed : création du super-administrateur initial...");

  const email = DEFAULT_EMAIL;
  const password = DEFAULT_PASSWORD;
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: {
      passwordHash,
      status: "validated",
      isSuperAdmin: true,
      validatedAt: new Date(),
    },
    create: {
      email,
      passwordHash,
      firstName: "Admin",
      lastName: "EVA",
      status: "validated",
      isSuperAdmin: true,
      validatedAt: new Date(),
    },
  });

  console.log("");
  console.log("Super-administrateur créé :");
  console.log("  Email    :", admin.email);
  console.log("  Mot de passe :", password);
  console.log("");
  console.log("⚠️  Changez ce mot de passe immédiatement via /admin/users.");
  console.log("    Ne JAMAIS utiliser ces identifiants en production.");
}

main()
  .catch((e) => {
    console.error("Erreur:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
