import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { syncCampaignTemplateStatus, syncCampaignTemplateStatuses } from "@/lib/campaigns";
import { findTemplate, listTemplates } from "@/lib/meta-whatsapp";

export async function GET() {
  const guard = await requireModule("campanhas");
  if (guard.response) return guard.response;
  try {
    const [row, templates] = await Promise.all([
      prisma.crmWorkspaceData.findUnique({ where: { key: "campaigns" }, select: { value: true } }),
      listTemplates(),
    ]);
    const campaigns = Array.isArray(row?.value) ? row.value as { metaApprovalStatus?: string; metaTemplateId?: string; modelo?: { name?: string; language?: string } }[] : [];
    const pending = campaigns.filter((campaign) =>
      ["PENDING", "PENDING_REVIEW", "IN_APPEAL"].includes(campaign.metaApprovalStatus ?? ""),
    );
    if (pending.length > 0) {
      await syncCampaignTemplateStatuses(templates);
      const listedIds = new Set(templates.map((template) => template.id));
      const unlisted = pending.filter((campaign) => campaign.metaTemplateId && campaign.modelo?.name && !listedIds.has(campaign.metaTemplateId));
      const directStatuses = await Promise.all(unlisted.map(async (campaign) => {
        const remote = await findTemplate(campaign.metaTemplateId!, campaign.modelo!.name!);
        if (!remote) return null;
        return {
          id: campaign.metaTemplateId!,
          name: campaign.modelo!.name!,
          language: campaign.modelo?.language ?? "pt_BR",
          status: remote.status,
          rejectedReason: remote.rejectedReason,
        };
      }));
      for (const status of directStatuses) if (status) await syncCampaignTemplateStatus(status);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[campaigns/templates/status] sincronização:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível consultar a aprovação dos modelos." }, { status: 502 });
  }
}
