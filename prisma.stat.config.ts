import "dotenv/config";
import path from "path";
import { defineConfig } from "prisma/config";

// Configuration Prisma d'EVA Stat : base dédiée data/stat/stat.db.
// Toujours passer --config prisma.stat.config.ts (voir scripts db:stat:* du package.json).
export default defineConfig({
  schema: "prisma/stat/schema.prisma",
  migrations: {
    path: "prisma/stat/migrations",
  },
  datasource: {
    url: `file:${path.join(process.cwd(), "data", "stat", "stat.db")}`,
  },
});
