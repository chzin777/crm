-- Higiene de números, score de engajamento e rodízio de filas. Somente adição: nenhum dado é apagado.
BEGIN;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "invalidWhatsApp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "invalidWhatsAppAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "invalidWhatsAppReason" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "engagementScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "engagementUpdatedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Contact_invalidWhatsApp_idx" ON "Contact"("invalidWhatsApp") WHERE "invalidWhatsApp";

-- Envios antigos já nascem "avaliados" (sem penalidade retroativa); só os novos entram na regra de 72 h.
ALTER TABLE "CampaignMessage" ADD COLUMN IF NOT EXISTS "engagementPenalizedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CampaignMessage" ALTER COLUMN "engagementPenalizedAt" DROP DEFAULT;
CREATE INDEX IF NOT EXISTS "CampaignMessage_engagement_pending_idx" ON "CampaignMessage"("sentAt") WHERE "engagementPenalizedAt" IS NULL;

ALTER TABLE "ChatQueue" ADD COLUMN IF NOT EXISTS "distribution" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "ChatQueue" ADD COLUMN IF NOT EXISTS "storePriority" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChatQueue" ADD COLUMN IF NOT EXISTS "rrCursor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ChatAgent" ADD COLUMN IF NOT EXISTS "store" TEXT;
COMMIT;
