-- Matriz RFV-P (Recência, Frequência, Valor, Pontualidade). Só adiciona: compatível com Blue/Green.
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "rfvpR" INTEGER;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "rfvpF" INTEGER;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "rfvpV" INTEGER;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "rfvpP" INTEGER;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "rfvpCode" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "rfvpSegment" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "rfvpUpdatedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Contact_rfvpSegment_idx" ON "Contact"("rfvpSegment");
CREATE INDEX IF NOT EXISTS "Contact_rfvpCode_idx" ON "Contact"("rfvpCode");

CREATE TABLE IF NOT EXISTS "VmsetPunctuality" (
  "cpf" TEXT NOT NULL PRIMARY KEY,
  "due" INTEGER NOT NULL DEFAULT 0,
  "onTime" INTEGER NOT NULL DEFAULT 0,
  "avgDelay" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "maxOverdueDays" INTEGER NOT NULL DEFAULT 0,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Junção das vendas do VMSet por cliente (cálculo diário do RFV-P).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "VmsetSale_type_sourceKey_orderDate_idx" ON "VmsetSale"("type", "sourceKey", "orderDate");
