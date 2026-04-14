// Migration script: Create flow_projects table
// Run inside the container: docker exec evaremote node /app/scripts/migrate-flow.js

const { createClient } = require("@libsql/client");

async function migrate() {
  const db = createClient({
    url: "file:/app/data/remoteva.db",
  });

  // Create the flow_projects table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "flow_projects" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "date" DATETIME NOT NULL,
        "location" TEXT NOT NULL,
        "room" TEXT NOT NULL,
        "speaker" TEXT NOT NULL DEFAULT '',
        "status" TEXT NOT NULL DEFAULT 'planned',
        "notes" TEXT NOT NULL DEFAULT '',
        "config" TEXT NOT NULL DEFAULT '{}',
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("flow_projects table created successfully");

  // Register migration in Prisma tracking table
  try {
    await db.execute(`
      INSERT OR IGNORE INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (
        'flow_projects_001',
        'manual_migration',
        datetime('now'),
        '20260414065939_add_flow_projects',
        NULL,
        NULL,
        datetime('now'),
        1
      )
    `);
    console.log("Migration record added to _prisma_migrations");
  } catch (err) {
    console.log("Note: Could not update _prisma_migrations:", err.message);
  }

  // Verify
  const result = await db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log("Tables in DB:", result.rows.map(r => r.name).join(", "));

  db.close();
  console.log("Migration complete!");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
