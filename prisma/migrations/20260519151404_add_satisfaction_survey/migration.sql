-- CreateTable
CREATE TABLE "satisfaction_responses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "trainee_id" TEXT NOT NULL,
    "magic_token" TEXT NOT NULL,
    "questions_snapshot" TEXT NOT NULL,
    "invited_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" DATETIME,
    CONSTRAINT "satisfaction_responses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "formation_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "satisfaction_responses_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "satisfaction_answers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "response_id" TEXT NOT NULL,
    "question_name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "satisfaction_answers_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "satisfaction_responses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_formations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "nom_long" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "prix_ht" REAL NOT NULL,
    "duree_jours" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sellsy_pipeline_id" INTEGER,
    "sellsy_step_initial" INTEGER,
    "sellsy_service_id" INTEGER,
    "sellsy_estimate_model_id" INTEGER,
    "code_opportunite" TEXT NOT NULL DEFAULT '',
    "drive_dossier_racine_id" TEXT,
    "drive_dossier_sessions_id" TEXT,
    "drive_template_programme_id" TEXT,
    "drive_template_convention_id" TEXT,
    "drive_template_contrat_id" TEXT,
    "drive_template_convocation_id" TEXT,
    "drive_template_emargement_id" TEXT,
    "drive_template_suivi_id" TEXT,
    "config_form" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "satisfaction_config_form" TEXT NOT NULL DEFAULT ''
);
INSERT INTO "new_formations" ("active", "code", "code_opportunite", "config_form", "created_at", "description", "drive_dossier_racine_id", "drive_dossier_sessions_id", "drive_template_contrat_id", "drive_template_convention_id", "drive_template_convocation_id", "drive_template_emargement_id", "drive_template_programme_id", "drive_template_suivi_id", "duree_jours", "id", "nom_long", "prix_ht", "sellsy_estimate_model_id", "sellsy_pipeline_id", "sellsy_service_id", "sellsy_step_initial", "updated_at") SELECT "active", "code", "code_opportunite", "config_form", "created_at", "description", "drive_dossier_racine_id", "drive_dossier_sessions_id", "drive_template_contrat_id", "drive_template_convention_id", "drive_template_convocation_id", "drive_template_emargement_id", "drive_template_programme_id", "drive_template_suivi_id", "duree_jours", "id", "nom_long", "prix_ht", "sellsy_estimate_model_id", "sellsy_pipeline_id", "sellsy_service_id", "sellsy_step_initial", "updated_at" FROM "formations";
DROP TABLE "formations";
ALTER TABLE "new_formations" RENAME TO "formations";
CREATE UNIQUE INDEX "formations_code_key" ON "formations"("code");
CREATE INDEX "formations_active_idx" ON "formations"("active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "satisfaction_responses_magic_token_key" ON "satisfaction_responses"("magic_token");

-- CreateIndex
CREATE INDEX "satisfaction_responses_session_id_idx" ON "satisfaction_responses"("session_id");

-- CreateIndex
CREATE INDEX "satisfaction_responses_trainee_id_idx" ON "satisfaction_responses"("trainee_id");

-- CreateIndex
CREATE INDEX "satisfaction_responses_magic_token_idx" ON "satisfaction_responses"("magic_token");

-- CreateIndex
CREATE INDEX "satisfaction_answers_response_id_idx" ON "satisfaction_answers"("response_id");
