-- CreateTable
CREATE TABLE "trainer_eval_responses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "trainer_id" TEXT NOT NULL,
    "magic_token" TEXT NOT NULL,
    "questions_snapshot" TEXT NOT NULL,
    "invited_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminder_1_at" DATETIME,
    "reminder_2_at" DATETIME,
    "submitted_at" DATETIME,
    CONSTRAINT "trainer_eval_responses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "formation_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "trainer_eval_responses_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "trainer_eval_answers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "response_id" TEXT NOT NULL,
    "question_name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "trainer_eval_answers_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "trainer_eval_responses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "satisfaction_config_form" TEXT NOT NULL DEFAULT '',
    "cold_eval_config_form" TEXT NOT NULL DEFAULT '',
    "trainer_eval_config_form" TEXT NOT NULL DEFAULT ''
);
INSERT INTO "new_formations" ("active", "code", "code_opportunite", "cold_eval_config_form", "config_form", "created_at", "description", "drive_dossier_racine_id", "drive_dossier_sessions_id", "drive_template_contrat_id", "drive_template_convention_id", "drive_template_convocation_id", "drive_template_emargement_id", "drive_template_programme_id", "drive_template_suivi_id", "duree_jours", "id", "nom_long", "prix_ht", "satisfaction_config_form", "sellsy_estimate_model_id", "sellsy_pipeline_id", "sellsy_service_id", "sellsy_step_initial", "updated_at") SELECT "active", "code", "code_opportunite", "cold_eval_config_form", "config_form", "created_at", "description", "drive_dossier_racine_id", "drive_dossier_sessions_id", "drive_template_contrat_id", "drive_template_convention_id", "drive_template_convocation_id", "drive_template_emargement_id", "drive_template_programme_id", "drive_template_suivi_id", "duree_jours", "id", "nom_long", "prix_ht", "satisfaction_config_form", "sellsy_estimate_model_id", "sellsy_pipeline_id", "sellsy_service_id", "sellsy_step_initial", "updated_at" FROM "formations";
DROP TABLE "formations";
ALTER TABLE "new_formations" RENAME TO "formations";
CREATE UNIQUE INDEX "formations_code_key" ON "formations"("code");
CREATE INDEX "formations_active_idx" ON "formations"("active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "trainer_eval_responses_magic_token_key" ON "trainer_eval_responses"("magic_token");

-- CreateIndex
CREATE INDEX "trainer_eval_responses_session_id_idx" ON "trainer_eval_responses"("session_id");

-- CreateIndex
CREATE INDEX "trainer_eval_responses_trainer_id_idx" ON "trainer_eval_responses"("trainer_id");

-- CreateIndex
CREATE INDEX "trainer_eval_responses_magic_token_idx" ON "trainer_eval_responses"("magic_token");

-- CreateIndex
CREATE INDEX "trainer_eval_responses_submitted_at_idx" ON "trainer_eval_responses"("submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "trainer_eval_responses_session_id_trainer_id_key" ON "trainer_eval_responses"("session_id", "trainer_id");

-- CreateIndex
CREATE INDEX "trainer_eval_answers_response_id_idx" ON "trainer_eval_answers"("response_id");
