-- Metas por quantidade além de valor (R$). Aditivo (expand-only): coluna nova anulável + default 0 no valor
-- (meta só de quantidade grava amount = 0). A versão anterior continua lendo/gravando amount normalmente.
ALTER TABLE "SellerGoal" ADD COLUMN IF NOT EXISTS "quantity" numeric(14, 2);
ALTER TABLE "SellerGoal" ALTER COLUMN "amount" SET DEFAULT 0;
ALTER TABLE "SalesGoal" ADD COLUMN IF NOT EXISTS "quantity" numeric(14, 2);
ALTER TABLE "SalesGoal" ALTER COLUMN "amount" SET DEFAULT 0;
