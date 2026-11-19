-- Exclusão de mensagens no /chat: marcação (o conteúdo original fica guardado para auditoria).
-- deletedScope: "me" (oculta no CRM) | "everyone" (revogada no WhatsApp do cliente). Aditivo e idempotente.
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "deletedScope" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "deletedByName" TEXT;
