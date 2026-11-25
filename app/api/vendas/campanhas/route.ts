import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { campaignDto, campaignOptions, campaignStandings } from "@/lib/sales-campaigns";
import { parseCampaignInput } from "@/lib/sales-campaigns-shared";

const MODULES = ["premiacoes", "metas", "lojas", "usuarios"] as const;

/** Campanhas com o resumo de cada uma (total vendido, prêmios, valor em prêmios) e as opções do formulário. */
export async function GET() {
  const guard = await requireModule(...MODULES);
  if (guard.response) return guard.response;
  const [campaigns, options, achievements] = await Promise.all([
    prisma.salesCampaign.findMany({ orderBy: [{ active: "desc" }, { endDate: "desc" }, { createdAt: "desc" }], take: 100 }),
    campaignOptions(),
    prisma.goalAchievement.groupBy({ by: ["campaignId"], _count: { _all: true }, _sum: { rewardAmount: true } }),
  ]);
  const won = new Map(achievements.map((row) => [row.campaignId, { count: row._count._all, reward: Number(row._sum.rewardAmount ?? 0) }]));
  // Total vendido só das ativas (cada uma é uma consulta agregada no espelho).
  const data = await Promise.all(
    campaigns.map(async (campaign) => {
      const total = campaign.active ? ((await campaignStandings(campaign).catch(() => null))?.standings.total ?? null) : null;
      return { ...campaignDto(campaign), total, achievements: won.get(campaign.id)?.count ?? 0, rewardTotal: won.get(campaign.id)?.reward ?? 0 };
    }),
  );
  return Response.json({ data, options }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const guard = await requireModule(...MODULES);
  if (guard.response) return guard.response;
  const parsed = parseCampaignInput(await request.json().catch(() => null));
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  const { startDate, endDate, groups, ...rest } = parsed.value;
  const campaign = await prisma.salesCampaign.create({
    data: { ...rest, groups, startDate: new Date(`${startDate}T00:00:00Z`), endDate: new Date(`${endDate}T00:00:00Z`), createdById: guard.user.id },
  });
  return Response.json({ data: campaignDto(campaign) }, { status: 201 });
}
