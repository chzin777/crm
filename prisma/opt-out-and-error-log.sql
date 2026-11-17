-- Opt-out de campanhas no contato + tabela de erros críticos. Somente criação/adição: nenhum dado é apagado.
BEGIN;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "marketingOptOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "marketingOptOutAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "marketingOptOutReason" TEXT;
CREATE INDEX IF NOT EXISTS "Contact_marketingOptOut_idx" ON "Contact"("marketingOptOut");

CREATE TABLE IF NOT EXISTS "SystemErrorLog" (
  "id" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'error',
  "source" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "stack" TEXT,
  "context" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemErrorLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SystemErrorLog_createdAt_idx" ON "SystemErrorLog"("createdAt");
CREATE INDEX IF NOT EXISTS "SystemErrorLog_source_createdAt_idx" ON "SystemErrorLog"("source", "createdAt");
COMMIT;
