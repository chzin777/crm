-- Respostas rápidas: categoria e visibilidade (ownerId nulo = toda a equipe; preenchido = só do atendente).
-- Aditivo e idempotente: versões antigas do app ignoram as colunas novas.
ALTER TABLE "ChatQuickReply" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "ChatQuickReply" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;
CREATE INDEX IF NOT EXISTS "ChatQuickReply_ownerId_idx" ON "ChatQuickReply" ("ownerId");
