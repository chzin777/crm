-- Busca rápida de contatos (/contatos) e histórico de compras (aditivo, compatível com o blue/green).
-- Rodar fora de transação (os índices usam CONCURRENTLY para não travar a tabela).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Só dígitos do CPF (com zeros à esquerda devolvidos: o cadastro do ERP perdeu os zeros) e do telefone.
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "cpfDigits" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "phoneDigits" TEXT;

CREATE OR REPLACE FUNCTION contact_digits() RETURNS trigger AS $$
DECLARE
  cpf_raw text := regexp_replace(COALESCE(NEW.cpf, ''), '\D', '', 'g');
  phone_raw text := regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g');
BEGIN
  NEW."cpfDigits" := CASE WHEN length(cpf_raw) BETWEEN 8 AND 11 THEN lpad(cpf_raw, 11, '0') WHEN cpf_raw = '' THEN NULL ELSE cpf_raw END;
  NEW."phoneDigits" := NULLIF(phone_raw, '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contact_digits_trg ON "Contact";
CREATE TRIGGER contact_digits_trg BEFORE INSERT OR UPDATE OF cpf, phone ON "Contact"
  FOR EACH ROW EXECUTE FUNCTION contact_digits();

-- Preenche os existentes (dispara o gatilho acima).
UPDATE "Contact" SET cpf = cpf WHERE "cpfDigits" IS NULL AND (cpf IS NOT NULL OR phone IS NOT NULL);

-- CPF e telefone: igualdade/prefixo (B-Tree) e trecho do telefone sem DDD (trigramas).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Contact_cpfDigits_idx" ON "Contact" ("cpfDigits" text_pattern_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Contact_phoneDigits_idx" ON "Contact" ("phoneDigits" text_pattern_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Contact_phoneDigits_trgm_idx" ON "Contact" USING gin ("phoneDigits" gin_trgm_ops);
-- Nome e e-mail por trecho (ILIKE '%...%').
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Contact_name_trgm_idx" ON "Contact" USING gin (name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Contact_email_trgm_idx" ON "Contact" USING gin (email gin_trgm_ops);
-- Ordenação padrão da lista.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Contact_lastPurchaseDate_idx" ON "Contact" ("lastPurchaseDate");
-- Histórico de compras do cliente: itens do espelho do VMSet já em ordem de data.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "VmsetSale_sourceKey_orderDate_idx" ON "VmsetSale" ("sourceKey", "orderDate" DESC);
