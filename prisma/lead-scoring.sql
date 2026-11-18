-- Lead Score & níveis, campos personalizados e links rastreados. Só adiciona: compatível com Blue/Green.
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "tier" TEXT NOT NULL DEFAULT 'BRONZE';
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "scoreUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "customFields" JSONB NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS "Contact_score_idx" ON "Contact"("score");
CREATE INDEX IF NOT EXISTS "Contact_tier_idx" ON "Contact"("tier");

CREATE TABLE IF NOT EXISTS "ContactScoreLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "contactId" TEXT NOT NULL REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "delta" INTEGER NOT NULL,
  "scoreAfter" INTEGER NOT NULL,
  "tierBefore" TEXT NOT NULL,
  "tierAfter" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "source" TEXT NOT NULL DEFAULT 'automacao',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ContactScoreLog_contactId_createdAt_idx" ON "ContactScoreLog"("contactId", "createdAt");

CREATE TABLE IF NOT EXISTS "ContactFieldDef" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'text',
  "options" JSONB NOT NULL DEFAULT '[]',
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ContactFieldDef_key_key" ON "ContactFieldDef"("key");

CREATE TABLE IF NOT EXISTS "TrackedLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "contactId" TEXT,
  "flowId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "label" TEXT NOT NULL DEFAULT '',
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "lastClickAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "TrackedLink_slug_key" ON "TrackedLink"("slug");
CREATE INDEX IF NOT EXISTS "TrackedLink_contactId_idx" ON "TrackedLink"("contactId");
CREATE INDEX IF NOT EXISTS "TrackedLink_createdAt_idx" ON "TrackedLink"("createdAt");

CREATE TABLE IF NOT EXISTS "TrackedLinkClick" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "linkId" TEXT NOT NULL REFERENCES "TrackedLink"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "contactId" TEXT,
  "userAgent" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TrackedLinkClick_linkId_createdAt_idx" ON "TrackedLinkClick"("linkId", "createdAt");
CREATE INDEX IF NOT EXISTS "TrackedLinkClick_contactId_createdAt_idx" ON "TrackedLinkClick"("contactId", "createdAt");
