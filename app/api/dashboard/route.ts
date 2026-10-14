import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { cached } from "@/lib/cache";

type DailySale = { day: string; revenue: number | string; sales: number | bigint };

export async function GET() {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  return Response.json({ data: await cached("dashboard", 60, loadDashboard) });
}

async function loadDashboard() {
  const [contacts, categoryCounts, sales, npsResponses, pipelineRecord, recentContacts] = await Promise.all([
    prisma.contact.aggregate({
      _count: { id: true },
      _sum: { purchases: true, totalSpent: true },
    }),
    prisma.contact.groupBy({ by: ["category"], _count: { id: true } }),
    prisma.$queryRaw<DailySale[]>`
      WITH normalized AS (
        SELECT
          CASE
            WHEN "data"->>'DATA_PEDIDO' ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN to_date("data"->>'DATA_PEDIDO', 'DD/MM/YYYY')
            WHEN "data"->>'DATA_PEDIDO' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN to_date(left("data"->>'DATA_PEDIDO', 10), 'YYYY-MM-DD')
            ELSE NULL
          END AS purchased_on,
          regexp_replace(COALESCE("data"->>'VALOR_ITEM_VENDA', ''), '[^0-9,.-]', '', 'g') AS raw_amount
        FROM "ImportedSale"
      ), parsed AS (
        SELECT purchased_on,
          CASE
            WHEN raw_amount ~ '^-?[0-9][0-9.]*,[0-9]{1,2}$' THEN replace(replace(raw_amount, '.', ''), ',', '.')::numeric
            WHEN raw_amount ~ '^-?[0-9]+(\\.[0-9]{1,2})?$' THEN raw_amount::numeric
            ELSE 0
          END AS amount
        FROM normalized
        WHERE purchased_on IS NOT NULL
      )
      SELECT to_char(purchased_on::date, 'YYYY-MM-DD') AS day, SUM(amount) AS revenue, COUNT(*) AS sales
      FROM parsed
      WHERE purchased_on >= CURRENT_DATE - INTERVAL '364 days'
        AND purchased_on <= CURRENT_DATE
      GROUP BY purchased_on::date
      ORDER BY day
    `,
    prisma.npsResponse.findMany({ select: { surveyKey: true, rating: true } }),
    prisma.crmWorkspaceData.findUnique({ where: { key: "pipeline" }, select: { value: true } }),
    prisma.contact.findMany({
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, name: true, category: true, updatedAt: true },
    }),
  ]);

  const pipeline = Array.isArray(pipelineRecord?.value) ? pipelineRecord.value : [];
  const pipelineCounts = new Map<string, number>();
  for (const item of pipeline) {
    if (typeof item !== "object" || item === null || !("coluna" in item)) continue;
    const stage = String(item.coluna);
    pipelineCounts.set(stage, (pipelineCounts.get(stage) ?? 0) + 1);
  }
  const ratings = npsResponses.map((response) => response.rating);
  const nps = ratings.length
    ? Math.round((ratings.filter((rating) => rating >= 9).length - ratings.filter((rating) => rating <= 6).length) / ratings.length * 100)
    : null;
  const dailySales = sales.map((entry) => ({
    day: entry.day,
    revenue: Number(entry.revenue),
    sales: Number(entry.sales),
  }));

  return {
    contacts: contacts._count.id,
    purchases: contacts._sum.purchases ?? 0,
    totalRevenue: contacts._sum.totalSpent?.toNumber() ?? 0,
    categoryCounts: Object.fromEntries(categoryCounts.map((entry) => [entry.category, entry._count.id])),
    pipelineCounts: Object.fromEntries(pipelineCounts),
    nps,
    npsResponses: ratings.length,
    dailySales,
    recentContacts,
  };
}
