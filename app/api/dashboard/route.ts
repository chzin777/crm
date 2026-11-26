import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { cached } from "@/lib/cache";
import { forbidUnless } from "@/lib/api-auth";

type DailySale = { day: string; revenue: number | string; sales: number | bigint };

export async function GET() {
  const forbidden = await forbidUnless("dashboard", "GET");
  if (forbidden) return forbidden;
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
    // Pre-aggregated by prisma/daily-sales-summary.sql; refreshed after each import.
    prisma.$queryRaw<DailySale[]>`
      SELECT to_char(day, 'YYYY-MM-DD') AS day, revenue, sales
      FROM "DailySalesSummary"
      WHERE day >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 364
        AND day <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
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
  // NPS da rede: respostas lançadas à mão + pesquisas do WhatsApp na escala de 0 a 10 (as antigas de 1 a 5 ficam fora).
  const whatsappScores = await prisma.npsFeedback.findMany({ where: { scale: 10, status: "ANSWERED", score: { not: null } }, select: { score: true } });
  const ratings = [...npsResponses.map((response) => response.rating), ...whatsappScores.map((row) => row.score ?? 0)];
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
