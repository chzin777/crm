-- Suíte comercial (aditivo, expand-only): lembretes de pós-venda e mapa de objeções.
CREATE TABLE IF NOT EXISTS "CommercialReminder" (
  "id" TEXT PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "saleKey" TEXT NOT NULL,
  "contactId" TEXT,
  "phone" TEXT,
  "dueDate" DATE NOT NULL,
  "status" TEXT NOT NULL,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommercialReminder_kind_saleKey_key" ON "CommercialReminder" ("kind", "saleKey");
CREATE INDEX IF NOT EXISTS "CommercialReminder_contactId_kind_createdAt_idx" ON "CommercialReminder" ("contactId", "kind", "createdAt");
CREATE INDEX IF NOT EXISTS "CommercialReminder_createdAt_idx" ON "CommercialReminder" ("createdAt");

CREATE TABLE IF NOT EXISTS "ConversationObjection" (
  "conversationId" TEXT PRIMARY KEY,
  "contactId" TEXT NOT NULL,
  "assigneeId" TEXT,
  "closedAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "evidence" TEXT,
  "weekKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ConversationObjection_closedAt_idx" ON "ConversationObjection" ("closedAt");
CREATE INDEX IF NOT EXISTS "ConversationObjection_weekKey_idx" ON "ConversationObjection" ("weekKey");
