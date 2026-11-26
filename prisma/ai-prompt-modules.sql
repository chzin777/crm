-- Módulos de prompt da IA (/ia): aditivo e idempotente. O conteúdo inicial entra pelo app só quando a tabela está
-- vazia (seed de lib/ai/prompt-modules.seed.json + regras da empresa, skills e instruções já salvas no banco).
CREATE TABLE IF NOT EXISTS "AiPromptModule" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'regras',
  "contentMarkdown" TEXT NOT NULL DEFAULT '',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "alwaysInclude" BOOLEAN NOT NULL DEFAULT false,
  "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "priorityOrder" INTEGER NOT NULL DEFAULT 1000,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AiPromptModule_slug_key" ON "AiPromptModule"("slug");
CREATE INDEX IF NOT EXISTS "AiPromptModule_isActive_priorityOrder_idx" ON "AiPromptModule"("isActive", "priorityOrder");

CREATE TABLE IF NOT EXISTS "AiPromptModuleRevision" (
  "id" TEXT PRIMARY KEY,
  "moduleId" TEXT NOT NULL REFERENCES "AiPromptModule"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "title" TEXT NOT NULL,
  "contentMarkdown" TEXT NOT NULL,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AiPromptModuleRevision_moduleId_createdAt_idx" ON "AiPromptModuleRevision"("moduleId", "createdAt");
