-- CreateTable
CREATE TABLE "trainers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telephone" TEXT NOT NULL DEFAULT '',
    "magic_token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_formation_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formation_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "date_debut" DATETIME NOT NULL,
    "date_fin" DATETIME NOT NULL,
    "capacite" INTEGER NOT NULL DEFAULT 8,
    "lieu" TEXT NOT NULL DEFAULT '',
    "horaires" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "drive_folder_id" TEXT,
    "drive_suivi_file_id" TEXT,
    "trainer_id" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "formation_sessions_formation_id_fkey" FOREIGN KEY ("formation_id") REFERENCES "formations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "formation_sessions_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_formation_sessions" ("capacite", "code", "created_at", "date_debut", "date_fin", "drive_folder_id", "drive_suivi_file_id", "formation_id", "horaires", "id", "lieu", "notes", "status", "updated_at") SELECT "capacite", "code", "created_at", "date_debut", "date_fin", "drive_folder_id", "drive_suivi_file_id", "formation_id", "horaires", "id", "lieu", "notes", "status", "updated_at" FROM "formation_sessions";
DROP TABLE "formation_sessions";
ALTER TABLE "new_formation_sessions" RENAME TO "formation_sessions";
CREATE UNIQUE INDEX "formation_sessions_code_key" ON "formation_sessions"("code");
CREATE INDEX "formation_sessions_formation_id_idx" ON "formation_sessions"("formation_id");
CREATE INDEX "formation_sessions_date_debut_idx" ON "formation_sessions"("date_debut");
CREATE INDEX "formation_sessions_status_idx" ON "formation_sessions"("status");
CREATE INDEX "formation_sessions_trainer_id_idx" ON "formation_sessions"("trainer_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "trainers_email_key" ON "trainers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "trainers_magic_token_key" ON "trainers"("magic_token");

-- CreateIndex
CREATE INDEX "trainers_magic_token_idx" ON "trainers"("magic_token");

-- CreateIndex
CREATE INDEX "trainers_active_idx" ON "trainers"("active");
