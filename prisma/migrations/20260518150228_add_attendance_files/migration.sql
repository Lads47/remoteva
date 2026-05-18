-- CreateTable
CREATE TABLE "attendance_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "date" DATETIME,
    "filename" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_id" TEXT,
    "uploaded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_files_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "formation_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "attendance_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "trainers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "attendance_files_session_id_idx" ON "attendance_files"("session_id");

-- CreateIndex
CREATE INDEX "attendance_files_date_idx" ON "attendance_files"("date");
