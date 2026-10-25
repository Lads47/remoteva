import path from "node:path";

// Tout EVA Stat vit sous data/stat/ (en prod : /app/data/stat, volume evaremote-data).
//   stat.db      base dédiée (WAL)
//   geo/         bases DB-IP Lite (scripts/stat-update-geo.sh)
//   archives/    agrégats mensuels figés, anonymes, conservés sans limite
//   backups/     copies quotidiennes de stat.db (rotation)
export const STAT_DIR = process.env.STAT_DIR || path.join(process.cwd(), "data", "stat");
export const STAT_DB_PATH = path.join(STAT_DIR, "stat.db");
export const GEO_DIR = path.join(STAT_DIR, "geo");
export const ARCHIVES_DIR = path.join(STAT_DIR, "archives");
export const BACKUPS_DIR = path.join(STAT_DIR, "backups");
