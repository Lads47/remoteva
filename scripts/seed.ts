import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";
import path from "path";

// Script de création de l'utilisateur admin initial
// Usage: npx tsx scripts/seed.ts

// Chemin vers la base de données SQLite
const dbPath = path.join(process.cwd(), "data", "remoteva.db");

// Création de l'adaptateur Prisma avec la config libSQL
const adapter = new PrismaLibSql({
  url: `file:${dbPath}`,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Création de l'utilisateur admin...");

  // Données de l'admin par défaut
  const email = "admin@eva.com";
  const password = "admin123"; // À changer en production !

  // Hash du mot de passe
  const passwordHash = await bcrypt.hash(password, 12);

  // Création ou mise à jour de l'admin
  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash },
    create: {
      email,
      passwordHash,
    },
  });

  console.log("Admin créé avec succès !");
  console.log("Email:", admin.email);
  console.log("Mot de passe:", password);
  console.log("");
  console.log("Changez le mot de passe en production !");

  // Création d'un lien de test (optionnel)
  const testLink = await prisma.accessLink.upsert({
    where: { slug: "demo2026" },
    update: {},
    create: {
      slug: "demo2026",
      serviceType: "newsletter",
      clientName: "Client Demo",
      serviceName: "Conférence Demo 2026",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 jours
      config: JSON.stringify({
        title: "Résumé de la conférence",
        content: "Ceci est un exemple de contenu pour la newsletter.",
        validated: false,
      }),
    },
  });

  console.log("");
  console.log("Lien de test créé !");
  console.log("URL:", `http://localhost:3000/${testLink.slug}`);
}

main()
  .catch((e) => {
    console.error("Erreur:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
