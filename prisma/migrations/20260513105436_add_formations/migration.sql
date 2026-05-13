-- CreateTable
CREATE TABLE "formations" (
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
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "formation_sessions" (
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
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "formation_sessions_formation_id_fkey" FOREIGN KEY ("formation_id") REFERENCES "formations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "trainees" (
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

-- CreateTable
CREATE TABLE "trainee_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainee_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "drive_file_id" TEXT NOT NULL,
    "drive_file_url" TEXT NOT NULL DEFAULT '',
    "file_name" TEXT NOT NULL,
    "generated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" DATETIME,
    "signed_at" DATETIME,
    CONSTRAINT "trainee_documents_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "trainee_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainee_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "message" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trainee_events_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "formations_code_key" ON "formations"("code");

-- CreateIndex
CREATE INDEX "formations_active_idx" ON "formations"("active");

-- CreateIndex
CREATE UNIQUE INDEX "formation_sessions_code_key" ON "formation_sessions"("code");

-- CreateIndex
CREATE INDEX "formation_sessions_formation_id_idx" ON "formation_sessions"("formation_id");

-- CreateIndex
CREATE INDEX "formation_sessions_date_debut_idx" ON "formation_sessions"("date_debut");

-- CreateIndex
CREATE INDEX "formation_sessions_status_idx" ON "formation_sessions"("status");

-- CreateIndex
CREATE INDEX "trainees_session_id_idx" ON "trainees"("session_id");

-- CreateIndex
CREATE INDEX "trainees_status_idx" ON "trainees"("status");

-- CreateIndex
CREATE INDEX "trainees_email_idx" ON "trainees"("email");

-- CreateIndex
CREATE INDEX "trainee_documents_trainee_id_idx" ON "trainee_documents"("trainee_id");

-- CreateIndex
CREATE INDEX "trainee_documents_type_idx" ON "trainee_documents"("type");

-- CreateIndex
CREATE INDEX "trainee_events_trainee_id_created_at_idx" ON "trainee_events"("trainee_id", "created_at");
