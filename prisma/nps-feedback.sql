-- Pesquisa de satisfação enviada pelo WhatsApp ao encerrar o atendimento.
-- Somente adições e idempotente. Não usar `prisma db push` (ver ecommerce-integration.sql).
BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  CREATE TYPE "NpsFeedbackStatus" AS ENUM ('PENDING', 'ANSWERED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "NpsFeedback" (
  "id"             TEXT NOT NULL,
  "conversationId" TEXT,
  "contactId"      TEXT NOT NULL,
  "attendantId"    TEXT,
  "queueId"        TEXT,
  "phone"          TEXT NOT NULL,
  "score"          INTEGER,
  "comment"        TEXT,
  "status"         "NpsFeedbackStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt"     TIMESTAMP(3),
  CONSTRAINT "NpsFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NpsFeedback_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "NpsFeedback_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NpsFeedback_attendantId_fkey" FOREIGN KEY ("attendantId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "NpsFeedback_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "ChatQueue"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "NpsFeedback_phone_status_idx" ON "NpsFeedback" ("phone", "status");
CREATE INDEX IF NOT EXISTS "NpsFeedback_status_createdAt_idx" ON "NpsFeedback" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "NpsFeedback_attendantId_createdAt_idx" ON "NpsFeedback" ("attendantId", "createdAt");

COMMIT;
