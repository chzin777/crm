import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/cache";
import type { WhatsAppTemplate } from "@/lib/meta-whatsapp";

export type CampaignRecord = {
  id: string;
  nome: string;
  status: string;
  modelo?: { name?: string; language?: string; body?: string; hasImage?: boolean; params?: string[] } | null;
  metaTemplateId?: string;
  metaApprovalStatus?: string;
  metaApprovalReason?: string;
  [key: string]: unknown;
};

const globalState = globalThis as typeof globalThis & { __dispatchCampaignLock?: Promise<void> };
const asJson = (value: unknown) => value as Prisma.InputJsonValue;

async function updateCampaigns(update: (campaigns: CampaignRecord[]) => CampaignRecord[]) {
  const previous = globalState.__dispatchCampaignLock ?? Promise.resolve();
  const task = previous.catch(() => undefined).then(async () => {
    const row = await prisma.crmWorkspaceData.findUnique({ where: { key: "campaigns" }, select: { value: true } });
    const campaigns = Array.isArray(row?.value) ? row.value as unknown as CampaignRecord[] : [];
    const next = update(campaigns);
    if (next === campaigns) return;
    await prisma.crmWorkspaceData.upsert({
      where: { key: "campaigns" },
      create: { key: "campaigns", value: asJson(next) },
      update: { value: asJson(next) },
    });
    await invalidateCache("dashboard");
  });
  globalState.__dispatchCampaignLock = task.catch(() => undefined);
  await task;
}

export function upsertCampaign(campaign: CampaignRecord) {
  return updateCampaigns((campaigns) => {
    const found = campaigns.some((item) => item.id === campaign.id);
    return found ? campaigns.map((item) => item.id === campaign.id ? { ...item, ...campaign } : item) : [campaign, ...campaigns];
  });
}

/** Tira a campanha da lista (mesma trava das gravações do disparo). true = existia. */
export async function removeCampaign(campaignId: string) {
  let removed = false;
  await updateCampaigns((campaigns) => {
    const next = campaigns.filter((item) => item.id !== campaignId);
    removed = next.length !== campaigns.length;
    return removed ? next : campaigns;
  });
  return removed;
}

export function patchCampaign(campaignId: string, patch: Partial<CampaignRecord>) {
  return updateCampaigns((campaigns) => campaigns.map((item) => item.id === campaignId ? { ...item, ...patch } : item));
}

function campaignStatusForTemplate(status: string) {
  if (status === "APPROVED") return "Pronta para envio";
  if (status === "REJECTED") return "Rejeitada pela Meta";
  if (status === "PENDING" || status === "PENDING_REVIEW" || status === "IN_APPEAL") return "Aguardando aprovação Meta";
  return "Modelo indisponível na Meta";
}

function isDispatchInProgress(status: string) {
  return ["Enviando", "Envio pausado", "Enviada", "Envio parcial", "Agendada"].includes(status);
}

export async function syncCampaignTemplateStatus(
  template: Pick<WhatsAppTemplate, "id" | "name" | "language" | "status" | "rejectedReason">,
) {
  const approvalStatus = template.status.toUpperCase();
  await updateCampaigns((campaigns) => campaigns.map((campaign) => {
    const matchesId = campaign.metaTemplateId && campaign.metaTemplateId === template.id;
    const matchesName = campaign.modelo?.name === template.name && campaign.modelo.language === template.language;
    if ((!matchesId && !matchesName) || !campaign.metaApprovalStatus) return campaign;
    const status = isDispatchInProgress(campaign.status) ? campaign.status : campaignStatusForTemplate(approvalStatus);
    const reason = approvalStatus === "REJECTED" ? template.rejectedReason ?? "A Meta rejeitou o modelo sem informar um motivo." : "";
    if (campaign.metaTemplateId === template.id && campaign.metaApprovalStatus === approvalStatus &&
      campaign.metaApprovalReason === reason && campaign.status === status) return campaign;
    return {
      ...campaign,
      metaTemplateId: template.id,
      metaApprovalStatus: approvalStatus,
      metaApprovalReason: reason,
      status,
      dataAtualizacao: new Date().toISOString(),
    };
  }));
}

export async function syncCampaignTemplateStatuses(templates: WhatsAppTemplate[]) {
  const byName = new Map(templates.map((template) => [`${template.name}|${template.language}`, template]));
  await updateCampaigns((campaigns) => campaigns.map((campaign) => {
    if (!campaign.metaApprovalStatus || !campaign.modelo?.name || !campaign.modelo.language) return campaign;
    const template = campaign.metaTemplateId
      ? templates.find((item) => item.id === campaign.metaTemplateId)
      : byName.get(`${campaign.modelo.name}|${campaign.modelo.language}`);
    if (!template) return campaign;
    const status = template.status.toUpperCase();
    const campaignStatus = isDispatchInProgress(campaign.status) ? campaign.status : campaignStatusForTemplate(status);
    const reason = status === "REJECTED" ? template.rejectedReason ?? "A Meta rejeitou o modelo sem informar um motivo." : "";
    if (campaign.metaTemplateId === template.id && campaign.metaApprovalStatus === status &&
      campaign.metaApprovalReason === reason && campaign.status === campaignStatus) return campaign;
    return {
      ...campaign,
      metaTemplateId: template.id,
      metaApprovalStatus: status,
      metaApprovalReason: reason,
      status: campaignStatus,
      dataAtualizacao: new Date().toISOString(),
    };
  }));
}
