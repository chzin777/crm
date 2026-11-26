import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { forbidUnless } from "@/lib/api-auth";
import { buildPurchaseOrders, summarizePurchases, type PurchaseOrder } from "@/lib/purchase-history";
import { storeNameForErpCode } from "@/lib/stores";

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

const brl = (value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Itens do espelho do VMSet guardados por cliente (no máximo os 2.000 mais recentes). */
const MAX_ITEMS = 2000;

/** Formato antigo (lista simples), mantido para quem já consome a rota (ex.: cartão do pipeline na home). */
const legacyRows = (orders: PurchaseOrder[]) =>
  orders.filter((order) => order.tipo === "venda").slice(0, 10).map((order) => ({
    produto: [...new Set(order.itens.map((item) => item.descricao))].join(", ") || "Compra",
    data: order.data ? order.data.split("-").reverse().join("/") : "",
    valor: brl(order.valorLiquido),
    pedido: order.pedido,
    loja: order.loja,
    itens: order.itens.length || 1,
  }));

export async function GET(_request: Request, context: RouteContext<"/api/contacts/[id]/purchases">) {
  const forbidden = await forbidUnless("contacts/[id]/purchases", "GET");
  if (forbidden) return forbidden;
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await context.params;
  const contact = await prisma.contact.findUnique({ where: { id }, select: { sourceKey: true } });
  if (!contact) return Response.json({ data: [], orders: [], summary: summarizePurchases([]) });

  // Uma consulta pelo índice (sourceKey, orderDate) do espelho do VMSet + o cadastro de lojas para o nome da unidade.
  const [items, stores] = await Promise.all([
    prisma.vmsetSale.findMany({
      where: { sourceKey: contact.sourceKey },
      orderBy: { orderDate: "desc" },
      take: MAX_ITEMS,
      select: {
        key: true, store: true, seller: true, orderNumber: true, invoiceNumber: true, orderDate: true, type: true,
        category: true, subcategory: true, productCode: true, description: true, brand: true, quantity: true,
        amount: true, discount: true, payment: true, paymentTerms: true,
      },
    }),
    prisma.store.findMany({ select: { number: true, name: true } }),
  ]);

  if (items.length) {
    const orders = buildPurchaseOrders(items, stores);
    return Response.json({ data: legacyRows(orders), orders, summary: summarizePurchases(orders) });
  }

  // Sem itens no espelho do VMSet: importação antiga em planilha (só o resumo por pedido).
  const rows = await prisma.$queryRaw<PurchaseRow[]>(Prisma.sql`
    WITH items AS (
      SELECT s.*,
        CASE
          WHEN s."data"->>'DATA_PEDIDO' ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN to_date(s."data"->>'DATA_PEDIDO', 'DD/MM/YYYY')
          WHEN s."data"->>'DATA_PEDIDO' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN to_date(left(s."data"->>'DATA_PEDIDO', 10), 'YYYY-MM-DD')
        END AS dia
      FROM "ImportedSale" s
      WHERE s."sourceKey" = ${contact.sourceKey}
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
    LIMIT 50
  `);

  const legacyOrders: PurchaseOrder[] = rows.map((row, index) => {
    const total = parseFloat(row.total ?? "0") || 0;
    return {
      id: `legado-${index}`,
      loja: storeNameForErpCode(stores, row.loja),
      lojaCodigo: row.loja ?? "",
      data: row.dia ?? "",
      pedido: row.pedido ?? "",
      notas: [],
      vendedor: "",
      tipo: "venda",
      itens: (row.produto ?? "").split(", ").filter(Boolean).map((descricao) => ({ descricao, marca: "", referencia: "", categoria: "", subcategoria: "", quantidade: 1, valorUnitario: 0, valorTotal: 0, desconto: 0 })),
      valorLiquido: Math.round(total * 100) / 100,
      desconto: 0,
      pagamento: [],
    };
  });

  return Response.json({
    data: rows.slice(0, 10).map((row) => ({
      produto: row.produto || "Compra",
      data: formatPurchaseDate(row.dia, row.data),
      valor: brl(parseFloat(row.total ?? "0") || 0),
      pedido: row.pedido ?? "",
      loja: row.loja ?? "",
      itens: Number(row.itens) || 1,
    })),
    orders: legacyOrders,
    summary: summarizePurchases(legacyOrders),
  });
}
