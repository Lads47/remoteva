-- CreateTable
CREATE TABLE "downloads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "site_id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "at" DATETIME NOT NULL,
    "file" TEXT NOT NULL,
    "version" TEXT,
    CONSTRAINT "downloads_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "downloads_site_id_day_idx" ON "downloads"("site_id", "day");
