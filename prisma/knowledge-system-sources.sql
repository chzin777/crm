-- v1.69.0: "Fontes automáticas" da IA viram documentos Markdown da Base de Conhecimento (aditivo, compatível com Blue/Green).
ALTER TABLE "KnowledgeDocument" ADD COLUMN IF NOT EXISTS "systemKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeDocument_systemKey_key" ON "KnowledgeDocument"("systemKey");
