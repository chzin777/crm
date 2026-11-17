-- v1.66.0: Skills da IA em Markdown (Estúdio de IA). Só cria a tabela nova; nenhum dado existente é alterado.
-- O seed das skills padrão e a migração dos "Assuntos rápidos" para AiBusinessRule rodam no app (idempotentes).
BEGIN;
CREATE TABLE IF NOT EXISTS "AiSkill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "triggerDescription" TEXT NOT NULL DEFAULT '',
    "instructionsMd" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiSkill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AiSkill_slug_key" ON "AiSkill"("slug");
CREATE INDEX IF NOT EXISTS "AiSkill_isActive_sortOrder_idx" ON "AiSkill"("isActive", "sortOrder");
COMMIT;
