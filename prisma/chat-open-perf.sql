-- Abertura de conversa no /chat: origem de campanha do contato (detalhe da conversa) sem varrer a tabela inteira.
-- Aditivo (expand-only). As mensagens já usam "ChatMessage_conversationId_createdAt_idx".
CREATE INDEX IF NOT EXISTS "CampaignMessage_contactId_repliedAt_idx" ON "CampaignMessage" ("contactId", "repliedAt" DESC) WHERE "repliedAt" IS NOT NULL;
