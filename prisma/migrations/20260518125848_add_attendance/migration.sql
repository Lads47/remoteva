-- CreateTable
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainee_id" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "slot" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "signed_by_id" TEXT,
    "signed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendances_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainees" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "attendances_signed_by_id_fkey" FOREIGN KEY ("signed_by_id") REFERENCES "trainers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "attendances_trainee_id_idx" ON "attendances"("trainee_id");

-- CreateIndex
CREATE INDEX "attendances_date_idx" ON "attendances"("date");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_trainee_id_date_slot_key" ON "attendances"("trainee_id", "date", "slot");
