-- Gatilhos do ERP VMSet em /automacoes: deduplicação de eventos por fluxo + nó (aditivo, compatível com Blue/Green).
CREATE TABLE IF NOT EXISTS "AutomationTriggerEvent" (
  "id" TEXT NOT NULL,
  "flowId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationTriggerEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AutomationTriggerEvent_flowId_nodeId_eventKey_key" ON "AutomationTriggerEvent" ("flowId", "nodeId", "eventKey");
CREATE INDEX IF NOT EXISTS "AutomationTriggerEvent_createdAt_idx" ON "AutomationTriggerEvent" ("createdAt");
