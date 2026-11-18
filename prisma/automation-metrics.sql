-- Métricas por nó, mensagens rastreadas e vendas atribuídas das automações. Só adiciona: compatível com Blue/Green.
CREATE TABLE IF NOT EXISTS "AutomationNodeStat" (
  "flowId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "entered" INTEGER NOT NULL DEFAULT 0,
  "completed" INTEGER NOT NULL DEFAULT 0,
  "errors" INTEGER NOT NULL DEFAULT 0,
  "rrCursor" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("flowId", "nodeId")
);

CREATE TABLE IF NOT EXISTS "AutomationMessageTouch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "flowId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "conversationId" TEXT,
  "externalId" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "repliedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "AutomationMessageTouch_flowId_nodeId_idx" ON "AutomationMessageTouch"("flowId", "nodeId");
CREATE INDEX IF NOT EXISTS "AutomationMessageTouch_externalId_idx" ON "AutomationMessageTouch"("externalId");
CREATE INDEX IF NOT EXISTS "AutomationMessageTouch_contactId_sentAt_idx" ON "AutomationMessageTouch"("contactId", "sentAt");

CREATE TABLE IF NOT EXISTS "AutomationSaleAttribution" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "flowId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "saleKey" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "saleDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AutomationSaleAttribution_flowId_nodeId_saleKey_key" ON "AutomationSaleAttribution"("flowId", "nodeId", "saleKey");
CREATE INDEX IF NOT EXISTS "AutomationSaleAttribution_flowId_idx" ON "AutomationSaleAttribution"("flowId");

-- Lookup do webhook de entrada pelo token (URL /api/webhooks/automacoes/<token>).
CREATE INDEX IF NOT EXISTS "AutomationFlow_webhookToken_idx" ON "AutomationFlow"("webhookToken");
