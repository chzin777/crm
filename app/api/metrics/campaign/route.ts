import { prisma } from "@/lib/prisma";
import { getUserAccess, requireApiSession } from "@/lib/api-auth";
import { bulkCampaignId, getBulkJob } from "@/lib/bulk-dispatch";
import { campaignMetrics } from "@/lib/campaign-metrics";
import { listTemplates } from "@/lib/meta-whatsapp";

/** type=bulk&id=<lote> (envio em massa) ou type=campaign&id=<campanha>. */
export async function GET(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const access = await getUserAccess(user.id);
  if (!access) return Response.json({ error: "Sem permissão." }, { status: 403 });

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "Informe o disparo." }, { status: 400 });

  try {
    if (type === "bulk") {
      const job = await getBulkJob(id, user.id, access.isAdmin);
      if (!job) return Response.json({ error: "Envio não encontrado." }, { status: 404 });
      // Lotes antigos não guardam a categoria do modelo: consulta a Meta.
      const category = job.template
        ? job.template.category ?? (await listTemplates().catch(() => [])).find((item) => item.name === job.template?.name && item.language === job.template?.language)?.category ?? null
        : null;
      return Response.json({ data: await campaignMetrics(bulkCampaignId(job.id), category) });
    }
    if (type === "campaign") {
      if (!access.modules.campanhas) return Response.json({ error: "Sem permissão para campanhas." }, { status: 403 });
      const row = await prisma.crmWorkspaceData.findUnique({ where: { key: "campaigns" }, select: { value: true } });
      const campaigns = Array.isArray(row?.value) ? (row.value as unknown as { id: string; modelo?: { name: string; language: string } | null }[]) : [];
      const campaign = campaigns.find((item) => item.id === id);
      if (!campaign) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
      const category = campaign.modelo
        ? (await listTemplates().catch(() => [])).find((item) => item.name === campaign.modelo?.name && item.language === campaign.modelo?.language)?.category ?? null
        : null;
      return Response.json({ data: await campaignMetrics(id, category) });
    }
    return Response.json({ error: "Tipo inválido." }, { status: 400 });
  } catch (error) {
    console.error("[metrics/campaign] falha ao calcular métricas:", error);
    return Response.json({ error: "Não foi possível calcular as métricas." }, { status: 500 });
  }
}
