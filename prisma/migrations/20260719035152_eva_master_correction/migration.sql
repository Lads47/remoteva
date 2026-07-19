-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_master_conferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presta_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "speakers" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "started_at" DATETIME,
    "ended_at" DATETIME,
    "transcript" TEXT,
    "summary" TEXT,
    "speaker_mapping" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "master_conferences_presta_id_fkey" FOREIGN KEY ("presta_id") REFERENCES "master_prestas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_master_conferences" ("created_at", "ended_at", "id", "position", "presta_id", "speakers", "started_at", "status", "title") SELECT "created_at", "ended_at", "id", "position", "presta_id", "speakers", "started_at", "status", "title" FROM "master_conferences";
DROP TABLE "master_conferences";
ALTER TABLE "new_master_conferences" RENAME TO "master_conferences";
CREATE INDEX "master_conferences_presta_id_idx" ON "master_conferences"("presta_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
