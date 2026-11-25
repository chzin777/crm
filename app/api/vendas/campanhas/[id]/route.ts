import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { autoLinkSellers, campaignDto, campaignStandings, evaluateCampaign, todayBr } from "@/lib/sales-campaigns";
import { parseCampaignInput } from "@/lib/sales-campaigns-shared";

type Context = { params: Promise<{ id: string }> };
const MODULES = ["premiacoes", "metas", "lojas", "usuarios"] as const;

/** Painel da campanha: apura agora (registra conquistas novas) e devolve ranking por loja/vendedor, líderes e histórico de prêmios. */
export async function GET(_request: Request, context: Context) {
  const guard = await requireModule(...MODULES);
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const campaign = await prisma.salesCampaign.findUnique({ where: { id } });
  if (!campaign) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
  const running = campaign.active && campaign.startDate.toISOString().slice(0, 10) <= todayBr();
  // Ativa e já começou: apura e registra conquistas; pausada só mostra o ranking (não gera prêmio).
  if (running) await autoLinkSellers().catch(() => 0);
  const { standings } = running ? await evaluateCampaign(campaign) : await campaignStandings(campaign);
  const achievements = await prisma.goalAchievement.findMany({
    where: { campaignId: id },
    orderBy: [{ achievedAt: "desc" }, { tier: "desc" }],
    take: 300,
    include: { _count: { select: { celebrations: true } } },
  });
  return Response.json(
    {
      data: {
        campaign: campaignDto(campaign),
        standings,
        achievements: achievements.map((row) => ({
          id: row.id,
          participantType: row.participantType,
          participantName: row.participantName,
          tier: row.tier,
          headline: row.headline,
          rewardLabel: row.rewardLabel,
          rewardAmount: Number(row.rewardAmount),
          achievedAt: row.achievedAt.toISOString(),
          notified: row._count.celebrations,
        })),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Edita a campanha (ou só { active } para pausar/reativar). Prêmios já conquistados ficam no histórico. */
export async function PUT(request: Request, context: Context) {
  const guard = await requireModule(...MODULES);
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body && Object.keys(body).length === 1 && typeof body.active === "boolean") {
    const campaign = await prisma.salesCampaign.update({ where: { id }, data: { active: body.active } }).catch(() => null);
    return campaign ? Response.json({ data: campaignDto(campaign) }) : Response.json({ error: "Campanha não encontrada." }, { status: 404 });
  }
  const parsed = parseCampaignInput(body);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  const { startDate, endDate, groups, ...rest } = parsed.value;
  const campaign = await prisma.salesCampaign
    .update({ where: { id }, data: { ...rest, groups, startDate: new Date(`${startDate}T00:00:00Z`), endDate: new Date(`${endDate}T00:00:00Z`) } })
    .catch(() => null);
  return campaign ? Response.json({ data: campaignDto(campaign) }) : Response.json({ error: "Campanha não encontrada." }, { status: 404 });
}
