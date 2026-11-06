-- Integração com o e-commerce: estrutura manual aplicada direto no banco.
-- Somente adições e idempotente. Não usar `prisma db push`, pois o banco tem objetos
-- manuais (ex.: a view materializada DailySalesSummary) que o Prisma não conhece.
BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "IntegrationEvent" (
  "eventId"    TEXT NOT NULL,
  "source"     TEXT NOT NULL,
  "eventType"  TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("eventId")
);

CREATE TABLE IF NOT EXISTS "CommerceSyncRecord" (
  "id"               TEXT NOT NULL,
  "recordType"       TEXT NOT NULL,
  "sourceId"         TEXT NOT NULL,
  "customerSourceId" TEXT,
  "payload"          JSONB NOT NULL,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommerceSyncRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CommerceSyncRecord_recordType_sourceId_key"
  ON "CommerceSyncRecord" ("recordType", "sourceId");
CREATE INDEX IF NOT EXISTS "CommerceSyncRecord_customerSourceId_updatedAt_idx"
  ON "CommerceSyncRecord" ("customerSourceId", "updatedAt");

ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "ecommerceCustomerId"       TEXT,
  ADD COLUMN IF NOT EXISTS "ecommerceUpdatedAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ecommercePurchases"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ecommerceTotalSpent"       DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ecommerceLastPurchaseDate" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Contact_ecommerceCustomerId_key"
  ON "Contact" ("ecommerceCustomerId");

COMMIT;
