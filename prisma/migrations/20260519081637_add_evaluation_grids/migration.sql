-- CreateTable
CREATE TABLE "evaluation_exercises" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formation_id" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 1,
    "titre" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "evaluation_exercises_formation_id_fkey" FOREIGN KEY ("formation_id") REFERENCES "formations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "evaluation_criteria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exercise_id" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 1,
    "libelle" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "evaluation_criteria_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "evaluation_exercises" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "trainee_exercise_evaluations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainee_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "evaluator_id" TEXT,
    "global_note" TEXT NOT NULL DEFAULT '',
    "observations" TEXT NOT NULL DEFAULT '',
    "evaluated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "drive_file_id" TEXT,
    "drive_web_url" TEXT,
    "drive_synced_at" DATETIME,
    "drive_sync_error" TEXT,
    CONSTRAINT "trainee_exercise_evaluations_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainees" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "trainee_exercise_evaluations_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "evaluation_exercises" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "trainee_exercise_evaluations_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "trainers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "trainee_criterion_scores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evaluation_id" TEXT NOT NULL,
    "criterion_id" TEXT NOT NULL,
    "score" TEXT NOT NULL DEFAULT '',
    "comment" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "trainee_criterion_scores_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "trainee_exercise_evaluations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "trainee_criterion_scores_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "evaluation_criteria" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "evaluation_exercises_formation_id_ordre_idx" ON "evaluation_exercises"("formation_id", "ordre");

-- CreateIndex
CREATE INDEX "evaluation_exercises_active_idx" ON "evaluation_exercises"("active");

-- CreateIndex
CREATE INDEX "evaluation_criteria_exercise_id_ordre_idx" ON "evaluation_criteria"("exercise_id", "ordre");

-- CreateIndex
CREATE INDEX "trainee_exercise_evaluations_trainee_id_idx" ON "trainee_exercise_evaluations"("trainee_id");

-- CreateIndex
CREATE INDEX "trainee_exercise_evaluations_exercise_id_idx" ON "trainee_exercise_evaluations"("exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "trainee_exercise_evaluations_trainee_id_exercise_id_key" ON "trainee_exercise_evaluations"("trainee_id", "exercise_id");

-- CreateIndex
CREATE INDEX "trainee_criterion_scores_criterion_id_idx" ON "trainee_criterion_scores"("criterion_id");

-- CreateIndex
CREATE UNIQUE INDEX "trainee_criterion_scores_evaluation_id_criterion_id_key" ON "trainee_criterion_scores"("evaluation_id", "criterion_id");
