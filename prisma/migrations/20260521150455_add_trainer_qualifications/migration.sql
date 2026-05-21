-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_trainers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telephone" TEXT NOT NULL DEFAULT '',
    "magic_token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "drive_cv_folder_id" TEXT,
    "qualifications" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_trainers" ("active", "created_at", "email", "id", "magic_token", "nom", "prenom", "telephone") SELECT "active", "created_at", "email", "id", "magic_token", "nom", "prenom", "telephone" FROM "trainers";
DROP TABLE "trainers";
ALTER TABLE "new_trainers" RENAME TO "trainers";
CREATE UNIQUE INDEX "trainers_email_key" ON "trainers"("email");
CREATE UNIQUE INDEX "trainers_magic_token_key" ON "trainers"("magic_token");
CREATE INDEX "trainers_magic_token_idx" ON "trainers"("magic_token");
CREATE INDEX "trainers_active_idx" ON "trainers"("active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
