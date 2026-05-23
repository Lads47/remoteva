-- CreateTable
CREATE TABLE "user_universe_access" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "universe" TEXT NOT NULL,
    "granted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_universe_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_admin_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at" DATETIME
);
INSERT INTO "new_admin_users" ("created_at", "email", "id", "password_hash") SELECT "created_at", "email", "id", "password_hash" FROM "admin_users";
DROP TABLE "admin_users";
ALTER TABLE "new_admin_users" RENAME TO "admin_users";
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");
CREATE INDEX "admin_users_status_idx" ON "admin_users"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "user_universe_access_user_id_idx" ON "user_universe_access"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_universe_access_user_id_universe_key" ON "user_universe_access"("user_id", "universe");
