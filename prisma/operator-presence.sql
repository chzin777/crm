-- Presença do operador (Online/Ausente/Offline), atividade real e lojas do usuário. Só adição e cópia de dados.
BEGIN;
ALTER TABLE "ChatAgent" ADD COLUMN IF NOT EXISTS "presenceStatus" TEXT NOT NULL DEFAULT 'ONLINE';
ALTER TABLE "ChatAgent" ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3);
ALTER TABLE "ChatAgent" ADD COLUMN IF NOT EXISTS "awayAuto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChatAgent" ADD COLUMN IF NOT EXISTS "stores" TEXT[] NOT NULL DEFAULT '{}';
-- Quem já estava pausado fica "Ausente"; a loja única da v1.101.0 vira a primeira da lista.
UPDATE "ChatAgent" SET "presenceStatus" = 'AWAY' WHERE "paused" AND "presenceStatus" = 'ONLINE';
UPDATE "ChatAgent" SET "stores" = ARRAY["store"] WHERE "store" IS NOT NULL AND "store" <> '' AND cardinality("stores") = 0;
COMMIT;
