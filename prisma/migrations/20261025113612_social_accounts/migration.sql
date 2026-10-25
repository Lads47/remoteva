-- CreateTable
CREATE TABLE "social_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "network" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "avatar_path" TEXT,
    "token_enc" TEXT NOT NULL,
    "token_expires_at" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" DATETIME,
    "last_error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "social_posts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL,
    "permalink" TEXT NOT NULL,
    "caption" TEXT,
    "media_type" TEXT NOT NULL,
    "media_path" TEXT,
    "published_at" DATETIME NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_posts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "social_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_network_external_id_key" ON "social_accounts"("network", "external_id");

-- CreateIndex
CREATE INDEX "social_posts_published_at_idx" ON "social_posts"("published_at");

-- CreateIndex
CREATE INDEX "social_posts_account_id_idx" ON "social_posts"("account_id");
