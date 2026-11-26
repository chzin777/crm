-- NPS de 0 a 10 (aditivo, compatível com a versão no ar durante o blue/green).
-- Linhas antigas ficam com scale = 5 (escala de 1 a 5) e saem dos cálculos novos; a versão nova grava scale = 10.
ALTER TABLE "NpsFeedback" ADD COLUMN IF NOT EXISTS "scale" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "NpsFeedback" ADD COLUMN IF NOT EXISTS "surveyType" TEXT NOT NULL DEFAULT 'ATENDIMENTO';
ALTER TABLE "NpsFeedback" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'chat';
ALTER TABLE "NpsFeedback" ADD COLUMN IF NOT EXISTS "orderKey" TEXT;
ALTER TABLE "NpsFeedback" ADD COLUMN IF NOT EXISTS "store" TEXT;
ALTER TABLE "NpsFeedback" ADD COLUMN IF NOT EXISTS "seller" TEXT;
ALTER TABLE "NpsFeedback" ADD COLUMN IF NOT EXISTS "flowId" TEXT;
-- Uma pesquisa de cada tipo por pedido do VMSet (orderKey nulo não conflita).
CREATE UNIQUE INDEX IF NOT EXISTS "NpsFeedback_orderKey_surveyType_key" ON "NpsFeedback" ("orderKey", "surveyType");
CREATE INDEX IF NOT EXISTS "NpsFeedback_contactId_scale_idx" ON "NpsFeedback" ("contactId", "scale");
