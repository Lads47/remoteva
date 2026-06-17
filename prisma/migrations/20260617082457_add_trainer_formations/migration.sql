-- DropIndex
DROP INDEX "trainers_is_external_idx";

-- CreateTable
CREATE TABLE "trainer_formations" (
    "trainer_id" TEXT NOT NULL,
    "formation_id" TEXT NOT NULL,
    "assigned_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("trainer_id", "formation_id"),
    CONSTRAINT "trainer_formations_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "trainer_formations_formation_id_fkey" FOREIGN KEY ("formation_id") REFERENCES "formations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "trainer_formations_formation_id_idx" ON "trainer_formations"("formation_id");
