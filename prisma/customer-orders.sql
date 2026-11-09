-- Pedidos do ERP por cliente (um registro por pedido), usado pelo /painel de clientes e retenção.
-- Somente adições e idempotente. Atualizado junto com o "DailySalesSummary" em /api/db/refresh-materialized-view.
-- Atualizar manualmente: REFRESH MATERIALIZED VIEW CONCURRENTLY "CustomerOrderSummary";
CREATE MATERIALIZED VIEW IF NOT EXISTS "CustomerOrderSummary" AS
WITH normalized AS (
  SELECT
    "sourceKey" AS source_key,
    COALESCE(NULLIF("data"->>'NUM_PEDIDO', ''), NULLIF("data"->>'NUM_NOTA', ''), 'row:' || "id"::text) AS order_key,
    CASE
      WHEN "data"->>'DATA_PEDIDO' ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date("data"->>'DATA_PEDIDO', 'DD/MM/YYYY')
      WHEN "data"->>'DATA_PEDIDO' ~ '^\d{4}-\d{2}-\d{2}' THEN to_date(left("data"->>'DATA_PEDIDO', 10), 'YYYY-MM-DD')
    END AS day,
    NULLIF(btrim("data"->>'LOJA'), '') AS store,
    NULLIF(btrim("data"->>'VENDEDOR'), '') AS seller,
    regexp_replace(COALESCE("data"->>'VALOR_ITEM_VENDA', ''), '[^0-9,.-]', '', 'g') AS raw_amount
  FROM "ImportedSale"
  WHERE COALESCE("data"->>'TIPO', 'Venda') = 'Venda'
)
SELECT
  source_key AS "sourceKey",
  order_key AS "orderKey",
  day,
  max(store) AS store,
  max(seller) AS seller,
  SUM(CASE
    WHEN raw_amount ~ '^-?[0-9][0-9.]*,[0-9]{1,2}$' THEN replace(replace(raw_amount, '.', ''), ',', '.')::numeric
    WHEN raw_amount ~ '^-?[0-9]+(\.[0-9]{1,2})?$' THEN raw_amount::numeric
    ELSE 0
  END)::numeric(14, 2) AS total
FROM normalized
WHERE day IS NOT NULL
GROUP BY source_key, order_key, day;

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerOrderSummary_key" ON "CustomerOrderSummary" ("sourceKey", "orderKey", day);
CREATE INDEX IF NOT EXISTS "CustomerOrderSummary_day_idx" ON "CustomerOrderSummary" (day);
