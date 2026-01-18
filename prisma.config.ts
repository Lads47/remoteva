import "dotenv/config";
import path from "path";
import { defineConfig } from "prisma/config";

// Configuration Prisma pour Remoteva
// La base de données SQLite est stockée dans /data/remoteva.db
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: `file:${path.join(process.cwd(), "data", "remoteva.db")}`,
  },
});
