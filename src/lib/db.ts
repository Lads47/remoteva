import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

// Singleton pattern pour le client Prisma
// Évite de créer plusieurs connexions en développement (hot reload)

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Chemin vers la base de données SQLite
const dbPath = path.join(process.cwd(), "data", "remoteva.db");

// Création de l'adaptateur Prisma avec la config libSQL
const adapter = new PrismaLibSql({
  url: `file:${dbPath}`,
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
