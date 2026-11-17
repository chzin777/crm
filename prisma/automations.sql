-- v1.65.0: Construtor visual de automações (/automacoes).
-- Só cria tabelas novas (nenhum dado existente é alterado).
BEGIN;
CREATE TABLE IF NOT EXISTS "AutomationFlow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "triggerType" TEXT NOT NULL DEFAULT '',
    "nodes" JSONB NOT NULL DEFAULT '[]',
    "edges" JSONB NOT NULL DEFAULT '[]',
    "webhookToken" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutomationFlow_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AutomationFlow_status_triggerType_idx" ON "AutomationFlow"("status", "triggerType");

CREATE TABLE IF NOT EXISTS "AutomationExecution" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "conversationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "currentNodeId" TEXT,
    "resumeAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "context" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AutomationExecution_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "AutomationFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AutomationExecution_status_resumeAt_idx" ON "AutomationExecution"("status", "resumeAt");
CREATE INDEX IF NOT EXISTS "AutomationExecution_contactId_status_idx" ON "AutomationExecution"("contactId", "status");
CREATE INDEX IF NOT EXISTS "AutomationExecution_flowId_status_idx" ON "AutomationExecution"("flowId", "status");

CREATE TABLE IF NOT EXISTS "AutomationStepLog" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationStepLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AutomationStepLog_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AutomationExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AutomationStepLog_executionId_createdAt_idx" ON "AutomationStepLog"("executionId", "createdAt");
COMMIT;
