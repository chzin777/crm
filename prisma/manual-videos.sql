-- Vídeos de treinamento do /manual. Só adiciona: compatível com Blue/Green.
CREATE TABLE IF NOT EXISTS "ManualVideo" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "duration" INTEGER,
  "thumbnailKey" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ManualVideo_order_idx" ON "ManualVideo"("order");
