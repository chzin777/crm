-- Aprovação humana de respostas financeiras da IA (parcelas/crediário). Somente criação: nenhum dado é apagado.
BEGIN;
CREATE TABLE IF NOT EXISTS "AiPendingAction" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "customerNameVmset" TEXT,
  "customerCpfMasked" TEXT,
  "cpf" TEXT,
  "installmentsSummary" JSONB,
  "draftMessage" TEXT NOT NULL,
  "transcribedText" TEXT,
  "heardName" TEXT,
  "nameMatches" BOOLEAN NOT NULL DEFAULT true,
  "decidedById" TEXT,
  "decidedByName" TEXT,
  "decidedAt" TIMESTAMP(3),
  "sentMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiPendingAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiPendingAction_conversationId_status_idx" ON "AiPendingAction"("conversationId", "status");
CREATE INDEX IF NOT EXISTS "AiPendingAction_status_createdAt_idx" ON "AiPendingAction"("status", "createdAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiPendingAction_conversationId_fkey') THEN
    ALTER TABLE "AiPendingAction" ADD CONSTRAINT "AiPendingAction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
COMMIT;
