-- Vendedores (espelho do VMSet: ativos e com venda nos últimos 60 dias) e metas mensais por vendedor.
-- A meta da loja é a soma das metas dos vendedores da loja no mês. Aditivo (expand-only).
CREATE TABLE IF NOT EXISTS "Seller" (
  "id"          text PRIMARY KEY,
  "vmsetId"     text NOT NULL,
  "name"        text NOT NULL,
  "storeNumber" integer,
  "stores"      integer[] NOT NULL DEFAULT '{}',
  "active"      boolean NOT NULL DEFAULT true,
  "lastSaleAt"  date,
  "sales60d"    numeric(14, 2),
  "syncedAt"    timestamptz(6),
  "createdAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Seller_vmsetId_key" ON "Seller" ("vmsetId");
CREATE INDEX IF NOT EXISTS "Seller_storeNumber_idx" ON "Seller" ("storeNumber");

CREATE TABLE IF NOT EXISTS "SellerGoal" (
  "id"          text PRIMARY KEY,
  "sellerId"    text NOT NULL REFERENCES "Seller" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "month"       text NOT NULL,
  "storeNumber" integer,
  "amount"      numeric(14, 2) NOT NULL,
  "updatedById" text,
  "createdAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "SellerGoal_sellerId_month_key" ON "SellerGoal" ("sellerId", "month");
CREATE INDEX IF NOT EXISTS "SellerGoal_month_storeNumber_idx" ON "SellerGoal" ("month", "storeNumber");

-- Metas mensais que não são de vendedor: global da empresa (scope "company", key "global") e por marca
-- (scope "brand", key = marca do VMSet em caixa alta, ex.: "RAY BAN").
CREATE TABLE IF NOT EXISTS "SalesGoal" (
  "id"          text PRIMARY KEY,
  "month"       text NOT NULL,
  "scope"       text NOT NULL,
  "key"         text NOT NULL,
  "label"       text NOT NULL,
  "amount"      numeric(14, 2) NOT NULL,
  "updatedById" text,
  "createdAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "SalesGoal_month_scope_key_key" ON "SalesGoal" ("month", "scope", "key");
