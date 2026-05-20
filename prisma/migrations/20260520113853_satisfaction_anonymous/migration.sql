-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_satisfaction_responses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "trainee_id" TEXT,
    "magic_token" TEXT,
    "questions_snapshot" TEXT NOT NULL,
    "invited_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" DATETIME,
    CONSTRAINT "satisfaction_responses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "formation_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "satisfaction_responses_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainees" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_satisfaction_responses" ("id", "invited_at", "magic_token", "questions_snapshot", "session_id", "submitted_at", "trainee_id") SELECT "id", "invited_at", "magic_token", "questions_snapshot", "session_id", "submitted_at", "trainee_id" FROM "satisfaction_responses";
DROP TABLE "satisfaction_responses";
ALTER TABLE "new_satisfaction_responses" RENAME TO "satisfaction_responses";
CREATE UNIQUE INDEX "satisfaction_responses_magic_token_key" ON "satisfaction_responses"("magic_token");
CREATE INDEX "satisfaction_responses_session_id_idx" ON "satisfaction_responses"("session_id");
CREATE INDEX "satisfaction_responses_trainee_id_idx" ON "satisfaction_responses"("trainee_id");
CREATE INDEX "satisfaction_responses_magic_token_idx" ON "satisfaction_responses"("magic_token");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
