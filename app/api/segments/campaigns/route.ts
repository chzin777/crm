import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { bulkCampaignId, listBulkJobs } from "@/lib/bulk-dispatch";

export type DispatchedCampaignOption = { id: string; nome: string; enviadaEm: string; enviados: number };

/** Disparos já enviados (campanhas e envios em massa), mais recentes primeiro, para as regras de conversão. */
export async function GET() {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const [groups, campaignsRow, bulkJobs] = await Promise.all([
    prisma.campaignMessage.groupBy({ by: ["campaignId"], where: { sentAt: { not: null } }, _min: { sentAt: true }, _count: { _all: true } }),
    prisma.crmWorkspaceData.findUnique({ where: { key: "campaigns" }, select: { value: true } }),
    listBulkJobs({ userId: "", all: true }),
  ]);
  const campaigns = Array.isArray(campaignsRow?.value) ? (campaignsRow.value as unknown as { id: string; nome?: string }[]) : [];
  const names = new Map<string, string>([
    ...campaigns.map((campaign) => [campaign.id, campaign.nome || "Campanha sem nome"] as const),
    ...bulkJobs.map((job) => [bulkCampaignId(job.id), `Envio em massa · ${job.stageName}${job.template ? ` · ${job.template.name}` : ""}`] as const),
  ]);

  const data: DispatchedCampaignOption[] = groups
    .filter((group) => group._min.sentAt)
    .map((group) => ({
      id: group.campaignId,
      nome: names.get(group.campaignId) ?? "Disparo removido",
      enviadaEm: (group._min.sentAt as Date).toISOString(),
      enviados: group._count._all,
    }))
    .sort((a, b) => b.enviadaEm.localeCompare(a.enviadaEm));
  return Response.json({ data });
}
