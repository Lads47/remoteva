-- CreateTable
CREATE TABLE "master_prestas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "drive_url" TEXT NOT NULL,
    "drive_status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "master_conferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presta_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "speakers" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "started_at" DATETIME,
    "ended_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "master_conferences_presta_id_fkey" FOREIGN KEY ("presta_id") REFERENCES "master_prestas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "master_vmix_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presta_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "master_vmix_logs_presta_id_fkey" FOREIGN KEY ("presta_id") REFERENCES "master_prestas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "master_prestas_slug_key" ON "master_prestas"("slug");

-- CreateIndex
CREATE INDEX "master_conferences_presta_id_idx" ON "master_conferences"("presta_id");

-- CreateIndex
CREATE INDEX "master_vmix_logs_presta_id_idx" ON "master_vmix_logs"("presta_id");
