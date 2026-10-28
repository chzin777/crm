-- Resumo diário de vendas usado pelo painel (evita varrer ImportedSale a cada visita).
-- Atualizar após importações: REFRESH MATERIALIZED VIEW CONCURRENTLY "DailySalesSummary";
CREATE MATERIALIZED VIEW IF NOT EXISTS "DailySalesSummary" AS
WITH normalized AS (
  SELECT
    CASE
      WHEN "data"->>'DATA_PEDIDO' ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date("data"->>'DATA_PEDIDO', 'DD/MM/YYYY')
      WHEN "data"->>'DATA_PEDIDO' ~ '^\d{4}-\d{2}-\d{2}' THEN to_date(left("data"->>'DATA_PEDIDO', 10), 'YYYY-MM-DD')
      ELSE NULL
    END AS purchased_on,
    regexp_replace(COALESCE("data"->>'VALOR_ITEM_VENDA', ''), '[^0-9,.-]', '', 'g') AS raw_amount
  FROM "ImportedSale"
), parsed AS (
  SELECT purchased_on,
    CASE
      WHEN raw_amount ~ '^-?[0-9][0-9.]*,[0-9]{1,2}$' THEN replace(replace(raw_amount, '.', ''), ',', '.')::numeric
      WHEN raw_amount ~ '^-?[0-9]+(\.[0-9]{1,2})?$' THEN raw_amount::numeric
      ELSE 0
    END AS amount
  FROM normalized
  WHERE purchased_on IS NOT NULL
)
SELECT purchased_on AS day, SUM(amount) AS revenue, COUNT(*)::bigint AS sales
FROM parsed
GROUP BY purchased_on;

CREATE UNIQUE INDEX IF NOT EXISTS "DailySalesSummary_day_key" ON "DailySalesSummary" (day);
