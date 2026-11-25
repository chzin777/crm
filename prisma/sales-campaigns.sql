-- Campanhas comerciais com premiação (ex.: "Foco Stepper") e conquistas celebradas na tela do vendedor. Aditivo (expand-only).
-- Vínculo do vendedor do VMSet com o usuário do CRM (quem recebe a comemoração).
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "userId" text;
CREATE INDEX IF NOT EXISTS "Seller_userId_idx" ON "Seller" ("userId");

CREATE TABLE IF NOT EXISTS "SalesCampaign" (
  "id"           text PRIMARY KEY,
  "name"         text NOT NULL,
  "description"  text,
  "metric"       text NOT NULL DEFAULT 'VALOR',
  "brand"        text,
  "category"     text,
  "stores"       integer[] NOT NULL DEFAULT '{}',
  "startDate"    date NOT NULL,
  "endDate"      date NOT NULL,
  "audience"     text NOT NULL DEFAULT 'INDIVIDUAL',
  "groups"       jsonb NOT NULL DEFAULT '[]',
  "target"       numeric(14, 2) NOT NULL,
  "rewardMode"   text NOT NULL DEFAULT 'UNICO',
  "rewardLabel"  text NOT NULL DEFAULT '',
  "rewardAmount" numeric(14, 2) NOT NULL DEFAULT 0,
  "active"       boolean NOT NULL DEFAULT true,
  "evaluatedAt"  timestamptz(6),
  "createdById"  text,
  "createdAt"    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SalesCampaign_active_endDate_idx" ON "SalesCampaign" ("active", "endDate");

CREATE TABLE IF NOT EXISTS "GoalAchievement" (
  "id"              text PRIMARY KEY,
  "campaignId"      text NOT NULL REFERENCES "SalesCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "participantType" text NOT NULL,
  "participantKey"  text NOT NULL,
  "participantName" text NOT NULL,
  "tier"            integer NOT NULL,
  "progress"        numeric(14, 2) NOT NULL,
  "headline"        text NOT NULL,
  "rewardLabel"     text NOT NULL,
  "rewardAmount"    numeric(14, 2) NOT NULL,
  "achievedAt"      timestamptz(6) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "GoalAchievement_campaignId_participantKey_tier_key" ON "GoalAchievement" ("campaignId", "participantKey", "tier");

CREATE TABLE IF NOT EXISTS "GoalCelebration" (
  "id"            text PRIMARY KEY,
  "achievementId" text NOT NULL REFERENCES "GoalAchievement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId"        text NOT NULL,
  "createdAt"     timestamptz(6) NOT NULL DEFAULT now(),
  "seenAt"        timestamptz(6)
);
CREATE UNIQUE INDEX IF NOT EXISTS "GoalCelebration_achievementId_userId_key" ON "GoalCelebration" ("achievementId", "userId");
CREATE INDEX IF NOT EXISTS "GoalCelebration_userId_seenAt_idx" ON "GoalCelebration" ("userId", "seenAt");
