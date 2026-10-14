import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

interface PurchaseRow {
  produto: string | null;
  data: string | null;
  total: string | null;
}

export async function GET(_request: Request, context: RouteContext<"/api/contacts/[id]/purchases">) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await context.params;
  const rows = await prisma.$queryRaw<PurchaseRow[]>(Prisma.sql`
    SELECT
      string_agg(DISTINCT NULLIF(btrim(s."data"->>'DESCRICAO'), ''), ', ') AS produto,
      max(s."data"->>'DATA_PEDIDO') AS data,
      sum(
        CASE
          WHEN v.value ~ '^-?[0-9][0-9.]*,[0-9]{1,2}$' THEN replace(replace(v.value, '.', ''), ',', '.')::numeric
          WHEN v.value ~ '^-?[0-9]+(\\.[0-9]{1,2})?$' THEN v.value::numeric
          ELSE 0
        END
      )::text AS total
    FROM "ImportedSale" s
    JOIN "Contact" c ON c."sourceKey" = s."sourceKey"
    CROSS JOIN LATERAL (
      SELECT regexp_replace(COALESCE(s."data"->>'VALOR_ITEM_VENDA', ''), '[^0-9,.-]', '', 'g') AS value
    ) v
    WHERE c.id = ${id}
    GROUP BY COALESCE(NULLIF(s."data"->>'NUM_PEDIDO', ''), NULLIF(s."data"->>'NUM_NOTA', ''), 'row:' || s."sourceRow"::text)
    ORDER BY
      CASE WHEN max(s."data"->>'DATA_PEDIDO') ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
        THEN to_date(max(s."data"->>'DATA_PEDIDO'), 'DD/MM/YYYY') END DESC NULLS LAST
    LIMIT 10
  `);

  return Response.json({
    data: rows.map((row) => ({
      produto: row.produto || "Compra",
      data: row.data ?? "",
      valor: `R$ ${(parseFloat(row.total ?? "0") || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    })),
  });
}
