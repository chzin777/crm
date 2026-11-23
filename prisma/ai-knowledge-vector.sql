-- Memória vetorial da IA (RAG + aprendizado contínuo). Só adição.
-- O vetor fica sempre em "embedding" (real[]); com a extensão pgvector disponível no servidor, a coluna
-- "embeddingVec" vector(1536) + índice HNSW (cosseno) são criados e a busca passa a rodar no próprio Postgres.
BEGIN;
CREATE TABLE IF NOT EXISTS "AiKnowledgeVector" (
  "id" TEXT PRIMARY KEY,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "content" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "embedding" REAL[] NOT NULL DEFAULT '{}',
  "contentHash" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AiKnowledgeVector_source_key" ON "AiKnowledgeVector" ("sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "AiKnowledgeVector_sourceType_idx" ON "AiKnowledgeVector" ("sourceType");
COMMIT;

-- pgvector (opcional): só roda se a extensão estiver instalada na imagem do Postgres; sem ela, nada muda.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
    EXECUTE 'ALTER TABLE "AiKnowledgeVector" ADD COLUMN IF NOT EXISTS "embeddingVec" vector(1536)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "AiKnowledgeVector_hnsw" ON "AiKnowledgeVector" USING hnsw ("embeddingVec" vector_cosine_ops)';
    EXECUTE 'UPDATE "AiKnowledgeVector" SET "embeddingVec" = "embedding"::vector WHERE "embeddingVec" IS NULL AND cardinality("embedding") = 1536';
  ELSE
    RAISE NOTICE 'pgvector indisponivel nesta imagem do Postgres: memoria vetorial segue com busca no aplicativo.';
  END IF;
END $$;
