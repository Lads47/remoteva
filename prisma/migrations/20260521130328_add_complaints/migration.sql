-- CreateTable
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "author_company" TEXT NOT NULL DEFAULT '',
    "author_role" TEXT NOT NULL DEFAULT '',
    "author_email" TEXT NOT NULL,
    "concerned_name" TEXT NOT NULL DEFAULT '',
    "concerned_company" TEXT NOT NULL DEFAULT '',
    "concerned_role" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "session_id" TEXT,
    "trainee_id" TEXT,
    "reception_mode" TEXT NOT NULL DEFAULT 'formulaire_web',
    "status" TEXT NOT NULL DEFAULT 'new',
    "response_type" TEXT NOT NULL DEFAULT '',
    "response_content" TEXT NOT NULL DEFAULT '',
    "action_corrective" TEXT NOT NULL DEFAULT '',
    "response_sent_at" DATETIME,
    "resolved_at" DATETIME,
    "resolved_by" TEXT NOT NULL DEFAULT '',
    "admin_notes" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "complaints_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "formation_sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "complaints_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainees" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "complaints_number_key" ON "complaints"("number");

-- CreateIndex
CREATE INDEX "complaints_status_idx" ON "complaints"("status");

-- CreateIndex
CREATE INDEX "complaints_created_at_idx" ON "complaints"("created_at");

-- CreateIndex
CREATE INDEX "complaints_session_id_idx" ON "complaints"("session_id");

-- CreateIndex
CREATE INDEX "complaints_trainee_id_idx" ON "complaints"("trainee_id");
