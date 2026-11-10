import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";
import { cachedStale } from "@/lib/cache";
import { bulkCampaignId, listBulkJobs } from "@/lib/bulk-dispatch";
import { campaignMetrics } from "@/lib/campaign-metrics";
import { listTemplates } from "@/lib/meta-whatsapp";

type Template = { name: string; language: string; category?: string | null } | null | undefined;

export type CampaignsOverview = {
  campaigns: number;
  funnel: { dispatched: number; delivered: number; read: number; replied: number; converted: number };
  revenue: number;
  orders: number;
  cost: number;
  roi: number | null;
  windowDays: number;
};

/** Funil e ROI somados de todas as campanhas e envios em massa (vendas do ERP na janela de conversão). */
async function loadOverview(): Promise<CampaignsOverview> {
  const [ids, campaignsRow, bulkJobs, templates] = await Promise.all([
    prisma.campaignMessage.findMany({ distinct: ["campaignId"], select: { campaignId: true } }),
    prisma.crmWorkspaceData.findUnique({ where: { key: "campaigns" }, select: { value: true } }),
    listBulkJobs({ userId: "", all: true }),
    listTemplates().catch(() => []),
  ]);
  const campaigns = Array.isArray(campaignsRow?.value) ? (campaignsRow.value as unknown as { id: string; modelo?: Template }[]) : [];
  const templateOf = new Map<string, Template>([
    ...campaigns.map((campaign) => [campaign.id, campaign.modelo] as const),
    ...bulkJobs.map((job) => [bulkCampaignId(job.id), job.template] as const),
  ]);
  const categoryOf = (template: Template) =>
    template ? template.category ?? templates.find((item) => item.name === template.name && item.language === template.language)?.category ?? null : null;

  const total: CampaignsOverview = { campaigns: 0, funnel: { dispatched: 0, delivered: 0, read: 0, replied: 0, converted: 0 }, revenue: 0, orders: 0, cost: 0, roi: null, windowDays: 0 };
  for (const { campaignId } of ids) {
    const metrics = await campaignMetrics(campaignId, categoryOf(templateOf.get(campaignId)));
    if (metrics.funnel.dispatched === 0) continue;
    total.campaigns += 1;
    total.funnel.dispatched += metrics.funnel.dispatched;
    total.funnel.delivered += metrics.funnel.delivered;
    total.funnel.read += metrics.funnel.read;
    total.funnel.replied += metrics.funnel.replied;
    total.funnel.converted += metrics.funnel.converted;
    total.revenue += metrics.revenue;
    total.orders += metrics.orders;
    total.cost += metrics.cost.real;
    total.windowDays = metrics.windowDays;
  }
  total.roi = total.cost > 0 ? (total.revenue - total.cost) / total.cost : null;
  return total;
}

export async function GET() {
  const guard = await requireModule("campanhas", "disparos");
  if (guard.response) return guard.response;
  try {
    const data = await cachedStale("campaigns:overview", 120, 3600, loadOverview);
    return Response.json({ data });
  } catch (error) {
    console.error("[metrics/campaigns-overview] falha ao calcular:", error);
    return Response.json({ error: "Não foi possível calcular o resumo dos disparos." }, { status: 500 });
  }
}
