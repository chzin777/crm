-- Vínculo automático vendedor do VMSet ↔ usuário do CRM por e-mail ou CPF (app: visão do vendedor). Aditivo (expand-only).
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "cpf" text;
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "emails" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "cpf" text;
