import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

interface PurchaseRow {
  produto: string | null;
  data: string | null;
  dia: string | null;
  total: string | null;
  pedido: string | null;
  loja: string | null;
  itens: number;
}

/** "2022-12-29T03:00:00.000Z" ou "29/12/2022" → "29/12/2022" (dia do pedido no ERP, sem hora). */
function formatPurchaseDate(day: string | null, raw: string | null) {
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) return day.split("-").reverse().join("/");
  return raw ?? "";
}

export async function GET(_request: Request, context: RouteContext<"/api/contacts/[id]/purchases">) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await context.params;
  const rows = await prisma.$queryRaw<PurchaseRow[]>(Prisma.sql`
    WITH items AS (
      SELECT s.*,
        CASE
          WHEN s."data"->>'DATA_PEDIDO' ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN to_date(s."data"->>'DATA_PEDIDO', 'DD/MM/YYYY')
          WHEN s."data"->>'DATA_PEDIDO' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN to_date(left(s."data"->>'DATA_PEDIDO', 10), 'YYYY-MM-DD')
        END AS dia
      FROM "ImportedSale" s
      JOIN "Contact" c ON c."sourceKey" = s."sourceKey"
      WHERE c.id = ${id}
    )
    SELECT
      string_agg(DISTINCT NULLIF(btrim(s."data"->>'DESCRICAO'), ''), ', ') AS produto,
      max(s."data"->>'DATA_PEDIDO') AS data,
      to_char(max(s.dia), 'YYYY-MM-DD') AS dia,
      max(NULLIF(s."data"->>'NUM_PEDIDO', '')) AS pedido,
      max(NULLIF(s."data"->>'LOJA', '')) AS loja,
      COUNT(*)::int AS itens,
      sum(
        CASE
          WHEN v.value ~ '^-?[0-9][0-9.]*,[0-9]{1,2}$' THEN replace(replace(v.value, '.', ''), ',', '.')::numeric
          WHEN v.value ~ '^-?[0-9]+(\\.[0-9]{1,2})?$' THEN v.value::numeric
          ELSE 0
        END
      )::text AS total
    FROM items s
    CROSS JOIN LATERAL (
      SELECT regexp_replace(COALESCE(s."data"->>'VALOR_ITEM_VENDA', ''), '[^0-9,.-]', '', 'g') AS value
    ) v
    GROUP BY COALESCE(NULLIF(s."data"->>'NUM_PEDIDO', ''), NULLIF(s."data"->>'NUM_NOTA', ''), 'row:' || s."sourceRow"::text)
    ORDER BY max(s.dia) DESC NULLS LAST
    LIMIT 10
  `);

  return Response.json({
    data: rows.map((row) => ({
      produto: row.produto || "Compra",
      data: formatPurchaseDate(row.dia, row.data),
      valor: `R$ ${(parseFloat(row.total ?? "0") || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      pedido: row.pedido ?? "",
      loja: row.loja ?? "",
      itens: Number(row.itens) || 1,
    })),
  });
}
