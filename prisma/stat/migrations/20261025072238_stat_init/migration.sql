-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domains" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "visitors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "site_id" TEXT NOT NULL,
    "first_seen_at" DATETIME NOT NULL,
    "last_seen_at" DATETIME NOT NULL,
    "visit_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "visitors_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "site_id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "visit_number" INTEGER NOT NULL,
    "day" TEXT NOT NULL,
    "started_at" DATETIME NOT NULL,
    "last_seen_at" DATETIME NOT NULL,
    "entry_path" TEXT NOT NULL,
    "exit_path" TEXT NOT NULL,
    "referrer" TEXT,
    "referrer_host" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "lat" REAL,
    "lon" REAL,
    "isp" TEXT,
    "ip_truncated" TEXT,
    "os" TEXT,
    "browser" TEXT,
    "device_type" TEXT NOT NULL DEFAULT 'desktop',
    "screen_width" INTEGER,
    "language" TEXT,
    "page_count" INTEGER NOT NULL DEFAULT 0,
    "duration_sec" INTEGER NOT NULL DEFAULT 0,
    "is_bot" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "visits_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "visits_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitors" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "pageviews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "site_id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT,
    "created_at" DATETIME NOT NULL,
    "duration_sec" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "pageviews_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pageviews_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "site_id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "props" TEXT,
    "path" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "events_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "events_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "daily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "site_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "pageviews" INTEGER NOT NULL DEFAULT 0,
    "visitors" INTEGER NOT NULL DEFAULT 0,
    "new_visitors" INTEGER NOT NULL DEFAULT 0,
    "bounces" INTEGER NOT NULL DEFAULT 0,
    "total_duration_sec" INTEGER NOT NULL DEFAULT 0,
    "bot_visits" INTEGER NOT NULL DEFAULT 0,
    "bot_pageviews" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "daily_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "sites_slug_key" ON "sites"("slug");

-- CreateIndex
CREATE INDEX "visitors_site_id_last_seen_at_idx" ON "visitors"("site_id", "last_seen_at");

-- CreateIndex
CREATE INDEX "visits_site_id_started_at_idx" ON "visits"("site_id", "started_at");

-- CreateIndex
CREATE INDEX "visits_site_id_last_seen_at_idx" ON "visits"("site_id", "last_seen_at");

-- CreateIndex
CREATE INDEX "visits_site_id_day_idx" ON "visits"("site_id", "day");

-- CreateIndex
CREATE INDEX "visits_visitor_id_idx" ON "visits"("visitor_id");

-- CreateIndex
CREATE INDEX "pageviews_site_id_created_at_idx" ON "pageviews"("site_id", "created_at");

-- CreateIndex
CREATE INDEX "pageviews_visit_id_idx" ON "pageviews"("visit_id");

-- CreateIndex
CREATE INDEX "events_site_id_created_at_idx" ON "events"("site_id", "created_at");

-- CreateIndex
CREATE INDEX "events_visit_id_idx" ON "events"("visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_site_id_date_key" ON "daily"("site_id", "date");

-- Les 3 sites mesurés (ici et pas dans un seed : deploy-vps.sh n'applique que le SQL des migrations)
INSERT OR IGNORE INTO "sites" ("id", "slug", "name", "domains", "created_at") VALUES
  ('stat_site_lads',   'lads',   'Les Ateliers du Stream', '["lesateliersdustream.fr","www.lesateliersdustream.fr"]', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('stat_site_wisio',  'wisio',  'wisio',                  '["wisio.io","www.wisio.io"]',                             strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('stat_site_evadif', 'evadif', 'evadif',                 '["evadif.com","www.evadif.com"]',                         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
