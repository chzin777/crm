-- Espelho limpo das vendas do VMSet (Oracle tab_dados_dinamicos), uma linha por linha do Oracle.
-- Mantido por scripts/vmset-sync.py (leitura no Oracle a cada minuto). Não há escrita no Oracle.
CREATE TABLE IF NOT EXISTS "VmsetSale" (
  "key"            text PRIMARY KEY,
  "sourceKey"      text,
  "partnerId"      text,
  "customerName"   text,
  "store"          text,
  "seller"         text,
  "orderNumber"    text,
  "invoiceNumber"  text,
  "orderDate"      date,
  "invoiceDate"    date,
  "type"           text,
  "category"       text,
  "subcategory"    text,
  "productCode"    text,
  "description"    text,
  "brand"          text,
  "quantity"       numeric(14, 3),
  "amount"         numeric(14, 2),
  "discount"       numeric(14, 2),
  "payment"        text,
  "paymentTerms"   text,
  "paymentAmount"  numeric(14, 2),
  "itemMovementId" text,
  "syncedAt"       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "VmsetSale_orderDate_idx" ON "VmsetSale" ("orderDate");
CREATE INDEX IF NOT EXISTS "VmsetSale_sourceKey_idx" ON "VmsetSale" ("sourceKey");

-- Numeração das linhas que a sincronização contínua acrescenta ao histórico de compras (ImportedSale).
CREATE SEQUENCE IF NOT EXISTS "ImportedSale_live_row_seq";

-- Pedidos por cliente para o /painel: só vendas, sem itens de serviço.
CREATE MATERIALIZED VIEW IF NOT EXISTS "VmsetCustomerOrder" AS
SELECT "sourceKey", "store" || '-' || "orderNumber" AS "orderKey", "orderDate" AS day,
  max("store") AS store, max("seller") AS seller, SUM("amount")::numeric(14, 2) AS total
FROM "VmsetSale"
WHERE "type" = 'Venda' AND "category" IS DISTINCT FROM 'SERVICOS'
  AND "sourceKey" IS NOT NULL AND "orderDate" IS NOT NULL AND "orderNumber" IS NOT NULL
GROUP BY "sourceKey", "store" || '-' || "orderNumber", "orderDate";
CREATE UNIQUE INDEX IF NOT EXISTS "VmsetCustomerOrder_key" ON "VmsetCustomerOrder" ("sourceKey", "orderKey", day);
CREATE INDEX IF NOT EXISTS "VmsetCustomerOrder_day_idx" ON "VmsetCustomerOrder" (day);

-- v1.9.3: mesma regra do BI — o período conta pela data da nota (DATA_NOTA); pedidos sem nota ainda não entram.
CREATE MATERIALIZED VIEW IF NOT EXISTS "VmsetInvoiceOrder" AS
SELECT "sourceKey", "store" || '-' || "orderNumber" AS "orderKey", "invoiceDate" AS day,
  max("store") AS store, max("seller") AS seller, SUM("amount")::numeric(14, 2) AS total
FROM "VmsetSale"
WHERE "type" = 'Venda' AND "category" IS DISTINCT FROM 'SERVICOS'
  AND "sourceKey" IS NOT NULL AND "invoiceDate" IS NOT NULL AND "orderNumber" IS NOT NULL
GROUP BY "sourceKey", "store" || '-' || "orderNumber", "invoiceDate";
CREATE UNIQUE INDEX IF NOT EXISTS "VmsetInvoiceOrder_key" ON "VmsetInvoiceOrder" ("sourceKey", "orderKey", day);
CREATE INDEX IF NOT EXISTS "VmsetInvoiceOrder_day_idx" ON "VmsetInvoiceOrder" (day);

-- v1.10.0: resumo de compras por cliente para os filtros de segmento (pedidos, LTV, ticket médio e última compra).
-- Só vendas e sem itens de serviço, mesma regra do /painel. A última compra conta pela data do pedido.
CREATE MATERIALIZED VIEW IF NOT EXISTS "VmsetCustomerStats" AS
SELECT "sourceKey",
  COUNT(DISTINCT "store" || '-' || "orderNumber")::int AS orders,
  SUM("amount")::numeric(14, 2) AS total,
  max("orderDate") AS "lastDay"
FROM "VmsetSale"
WHERE "type" = 'Venda' AND "category" IS DISTINCT FROM 'SERVICOS' AND "sourceKey" IS NOT NULL AND "orderNumber" IS NOT NULL
GROUP BY "sourceKey";
CREATE UNIQUE INDEX IF NOT EXISTS "VmsetCustomerStats_key" ON "VmsetCustomerStats" ("sourceKey");
