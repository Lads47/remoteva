-- Migration: EVA Flow capture integration
-- Adds Conference, Director, DirectorAvailability, ApiKey models
-- Extends FlowProject with eventId, director, regie, recordingLocalPath
-- Backfills existing FlowProjects with eventId + a default Conference

-- 1. Create Conference table (referenced by step 2 backfill)
CREATE TABLE "flow_conferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flow_project_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "speaker" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "scheduled_start" DATETIME,
    "scheduled_end" DATETIME,
    "start_time" DATETIME,
    "end_time" DATETIME,
    "local_folder" TEXT,
    "duration_seconds" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "flow_conferences_flow_project_id_fkey" FOREIGN KEY ("flow_project_id") REFERENCES "flow_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 2. Backfill: create one Conference per existing FlowProject (using project title + speaker)
-- Uses random hex for IDs (cuid not generatable in pure SQL, but uniqueness is sufficient)
INSERT INTO "flow_conferences" ("id", "flow_project_id", "order", "title", "speaker", "status", "created_at", "updated_at")
SELECT
    lower(hex(randomblob(12))),
    "id",
    1,
    "title",
    "speaker",
    "status",
    "created_at",
    "updated_at"
FROM "flow_projects";

-- 3. Create Director table
CREATE TABLE "directors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "magic_token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create DirectorAvailability table
CREATE TABLE "director_availabilities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "director_id" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "director_availabilities_director_id_fkey" FOREIGN KEY ("director_id") REFERENCES "directors" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 5. Create ApiKey table
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "last_used_at" DATETIME,
    "expires_at" DATETIME,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Extend flow_projects: add event_id, director, director_id, regie, recording_local_path
-- SQLite requires recreating the table to add NOT NULL UNIQUE columns properly
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_flow_projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "location" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "speaker" TEXT NOT NULL DEFAULT '',
    "director" TEXT NOT NULL DEFAULT '',
    "director_id" TEXT,
    "regie" TEXT,
    "recording_local_path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "notes" TEXT NOT NULL DEFAULT '',
    "config" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "flow_projects_director_id_fkey" FOREIGN KEY ("director_id") REFERENCES "directors" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Backfill event_id with format DDMMYY-NNN
-- ROW_NUMBER partitioned by date(date) gives a per-day counter (001, 002, ...)
INSERT INTO "new_flow_projects" (
    "id", "event_id", "title", "date", "location", "room",
    "speaker", "director", "director_id", "regie", "recording_local_path",
    "status", "notes", "config", "created_at", "updated_at"
)
SELECT
    "id",
    printf('%s-%03d',
        strftime('%d%m%y', "date"),
        ROW_NUMBER() OVER (PARTITION BY date("date") ORDER BY "created_at", "id")
    ) AS "event_id",
    "title", "date", "location", "room",
    "speaker",
    '' AS "director",
    NULL AS "director_id",
    NULL AS "regie",
    NULL AS "recording_local_path",
    "status", "notes", "config",
    "created_at", "updated_at"
FROM "flow_projects";

DROP TABLE "flow_projects";
ALTER TABLE "new_flow_projects" RENAME TO "flow_projects";

-- 7. Indexes for flow_projects
CREATE UNIQUE INDEX "flow_projects_event_id_key" ON "flow_projects"("event_id");
CREATE INDEX "flow_projects_date_idx" ON "flow_projects"("date");
CREATE INDEX "flow_projects_event_id_idx" ON "flow_projects"("event_id");
CREATE INDEX "flow_projects_regie_idx" ON "flow_projects"("regie");
CREATE INDEX "flow_projects_director_id_idx" ON "flow_projects"("director_id");
CREATE INDEX "flow_projects_status_idx" ON "flow_projects"("status");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- 8. Indexes for other new tables
CREATE INDEX "flow_conferences_flow_project_id_order_idx" ON "flow_conferences"("flow_project_id", "order");
CREATE INDEX "flow_conferences_status_idx" ON "flow_conferences"("status");

CREATE UNIQUE INDEX "directors_email_key" ON "directors"("email");
CREATE UNIQUE INDEX "directors_magic_token_key" ON "directors"("magic_token");
CREATE INDEX "directors_magic_token_idx" ON "directors"("magic_token");
CREATE INDEX "directors_active_idx" ON "directors"("active");

CREATE INDEX "director_availabilities_date_idx" ON "director_availabilities"("date");
CREATE UNIQUE INDEX "director_availabilities_director_id_date_key" ON "director_availabilities"("director_id", "date");

CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys"("key_hash");
CREATE INDEX "api_keys_revoked_idx" ON "api_keys"("revoked");
