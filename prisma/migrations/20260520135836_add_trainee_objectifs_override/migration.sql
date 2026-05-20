-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_trainees" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inscrit',
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telephone" TEXT NOT NULL DEFAULT '',
    "inscription_type" TEXT NOT NULL,
    "raison_sociale" TEXT NOT NULL DEFAULT '',
    "siret" TEXT NOT NULL DEFAULT '',
    "adresse_siege" TEXT NOT NULL DEFAULT '',
    "domaine_activite" TEXT NOT NULL DEFAULT '',
    "contact_admin" TEXT NOT NULL DEFAULT '',
    "adresse_postale" TEXT NOT NULL DEFAULT '',
    "statut_actuel" TEXT NOT NULL DEFAULT '',
    "mode_financement" TEXT NOT NULL DEFAULT '',
    "opco_detecte" TEXT NOT NULL DEFAULT '',
    "id_opco" TEXT NOT NULL DEFAULT '',
    "statut_dossier_financement" TEXT NOT NULL DEFAULT '',
    "montant_ht" REAL,
    "psh" BOOLEAN NOT NULL DEFAULT false,
    "besoins_adaptation" TEXT NOT NULL DEFAULT '',
    "objectifs_atteints_override" TEXT NOT NULL DEFAULT '',
    "sellsy_company_id" INTEGER,
    "sellsy_individual_id" INTEGER,
    "sellsy_opportunity_id" INTEGER,
    "sellsy_estimate_id" INTEGER,
    "drive_folder_id" TEXT,
    "eval_entree" TEXT NOT NULL DEFAULT '{}',
    "attentes" TEXT NOT NULL DEFAULT '',
    "date_envoi_devis" DATETIME,
    "date_signature_devis" DATETIME,
    "date_envoi_convention" DATETIME,
    "date_signature_convention" DATETIME,
    "date_convocation" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "trainees_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "formation_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_trainees" ("adresse_postale", "adresse_siege", "attentes", "besoins_adaptation", "contact_admin", "created_at", "date_convocation", "date_envoi_convention", "date_envoi_devis", "date_signature_convention", "date_signature_devis", "domaine_activite", "drive_folder_id", "email", "eval_entree", "id", "id_opco", "inscription_type", "mode_financement", "montant_ht", "nom", "opco_detecte", "prenom", "psh", "raison_sociale", "sellsy_company_id", "sellsy_estimate_id", "sellsy_individual_id", "sellsy_opportunity_id", "session_id", "siret", "status", "statut_actuel", "statut_dossier_financement", "telephone", "updated_at") SELECT "adresse_postale", "adresse_siege", "attentes", "besoins_adaptation", "contact_admin", "created_at", "date_convocation", "date_envoi_convention", "date_envoi_devis", "date_signature_convention", "date_signature_devis", "domaine_activite", "drive_folder_id", "email", "eval_entree", "id", "id_opco", "inscription_type", "mode_financement", "montant_ht", "nom", "opco_detecte", "prenom", "psh", "raison_sociale", "sellsy_company_id", "sellsy_estimate_id", "sellsy_individual_id", "sellsy_opportunity_id", "session_id", "siret", "status", "statut_actuel", "statut_dossier_financement", "telephone", "updated_at" FROM "trainees";
DROP TABLE "trainees";
ALTER TABLE "new_trainees" RENAME TO "trainees";
CREATE INDEX "trainees_session_id_idx" ON "trainees"("session_id");
CREATE INDEX "trainees_status_idx" ON "trainees"("status");
CREATE INDEX "trainees_email_idx" ON "trainees"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
