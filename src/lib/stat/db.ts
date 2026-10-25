import fs from "node:fs";
import { PrismaClient } from "@/generated/prisma-stat/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { STAT_DB_PATH, STAT_DIR } from "./paths";

// Client de la base EVA Stat, distinct de @/lib/db (remoteva.db).
const g = globalThis as unknown as { statDb?: PrismaClient; statWal?: Promise<void> };

fs.mkdirSync(STAT_DIR, { recursive: true });

export const statDb = g.statDb ?? new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${STAT_DB_PATH}` }) });
if (process.env.NODE_ENV !== "production") g.statDb = statDb;

// WAL : les lectures du tableau de bord ne bloquent plus les écritures de la collecte.
// Le mode est enregistré dans le fichier ; on le repose une fois par processus.
export function ensureWal(): Promise<void> {
  g.statWal ??= statDb
    .$queryRawUnsafe("PRAGMA journal_mode = WAL")
    .then(() => undefined)
    .catch(() => {
      g.statWal = undefined;
    });
  return g.statWal;
}

export default statDb;
