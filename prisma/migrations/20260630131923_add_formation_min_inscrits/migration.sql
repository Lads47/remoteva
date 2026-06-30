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
    "min_inscrits" INTEGER NOT NULL DEFAULT 0,
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
INSERT INTO "new_formations" ("active", "code", "code_opportunite", "cold_eval_config_form", "config_form", "created_at", "description", "drive_dossier_racine_id", "drive_dossier_sessions_id", "drive_template_contrat_id", "drive_template_convention_id", "drive_template_convocation_id", "drive_template_emargement_id", "drive_template_programme_id", "drive_template_suivi_id", "duree_jours", "id", "nom_long", "prix_ht", "satisfaction_config_form", "sellsy_estimate_model_id", "sellsy_pipeline_id", "sellsy_service_id", "sellsy_step_initial", "trainer_eval_config_form", "updated_at") SELECT "active", "code", "code_opportunite", "cold_eval_config_form", "config_form", "created_at", "description", "drive_dossier_racine_id", "drive_dossier_sessions_id", "drive_template_contrat_id", "drive_template_convention_id", "drive_template_convocation_id", "drive_template_emargement_id", "drive_template_programme_id", "drive_template_suivi_id", "duree_jours", "id", "nom_long", "prix_ht", "satisfaction_config_form", "sellsy_estimate_model_id", "sellsy_pipeline_id", "sellsy_service_id", "sellsy_step_initial", "trainer_eval_config_form", "updated_at" FROM "formations";
DROP TABLE "formations";
ALTER TABLE "new_formations" RENAME TO "formations";
CREATE UNIQUE INDEX "formations_code_key" ON "formations"("code");
CREATE INDEX "formations_active_idx" ON "formations"("active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
