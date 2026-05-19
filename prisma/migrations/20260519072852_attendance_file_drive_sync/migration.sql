-- AlterTable
ALTER TABLE "attendance_files" ADD COLUMN "drive_file_id" TEXT;
ALTER TABLE "attendance_files" ADD COLUMN "drive_sync_error" TEXT;
ALTER TABLE "attendance_files" ADD COLUMN "drive_synced_at" DATETIME;
ALTER TABLE "attendance_files" ADD COLUMN "drive_web_url" TEXT;
