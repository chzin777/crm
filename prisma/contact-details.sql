-- Ficha do cliente no /chat: foto e notas internas.
-- Somente adições e idempotente. Não usar `prisma db push` (ver ecommerce-integration.sql).
BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;

CREATE TABLE IF NOT EXISTS "ContactNote" (
  "id"         TEXT NOT NULL,
  "contactId"  TEXT NOT NULL,
  "authorId"   TEXT,
  "authorName" TEXT NOT NULL,
  "text"       TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContactNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ContactNote_contactId_createdAt_idx"
  ON "ContactNote" ("contactId", "createdAt");

COMMIT;
