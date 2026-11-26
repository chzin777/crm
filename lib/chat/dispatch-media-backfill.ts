import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { listTemplates } from "@/lib/meta-whatsapp";
import { firstDispatch } from "@/lib/chat/conversation";
import { downloadMedia, storeDispatchMedia } from "@/lib/chat/dispatch-media";

type CampaignLike = {
  nome?: string;
  modelo?: { name?: string; language?: string; hasImage?: boolean } | null;
  anexos?: { name?: string; type?: string; url?: string }[];
};
type TemplateLike = { name: string; language: string; headerFormat?: string | null; headerImageUrl?: string | null };

/** De onde veio a imagem do cabeçalho da campanha: o anexo JPG/PNG da campanha ou a imagem do modelo na Meta. */
export function campaignHeaderSource(campaign: CampaignLike, templates: TemplateLike[]): { url: string; name?: string } | null {
  if (!campaign.modelo?.hasImage) return null;
  const attachment = (campaign.anexos ?? []).find((file) => ["image/jpeg", "image/png"].includes(file.type ?? "") && file.url);
  if (attachment?.url) return { url: attachment.url, name: attachment.name };
  const remote = templates.find((item) => item.name === campaign.modelo?.name && item.language === campaign.modelo?.language);
  return remote?.headerImageUrl ? { url: remote.headerImageUrl } : null;
}

/**
 * Disparos recentes gravados no /chat só com o texto (antes da v1.127.0): põe a imagem do cabeçalho da campanha
 * nas mensagens. Uma vez por versão; só mexe em mensagens de campanha sem anexo.
 */
let attempted = false;

export async function backfillDispatchMedia(days = 7) {
  if (attempted) return;
  attempted = true;
  if (!(await firstDispatch("chat-dispatch-media-backfill:v1"))) return;
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: "campaigns" }, select: { value: true } });
  const campaigns = (Array.isArray(row?.value) ? (row.value as unknown as CampaignLike[]) : []).filter((item) => item.nome && item.modelo?.hasImage);
  if (!campaigns.length) return;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const templates = await listTemplates().catch(() => []);
  let updated = 0;
  for (const campaign of campaigns) {
    const where = { author: "agent" as const, authorName: `Campanha · ${campaign.nome}`.slice(0, 120), createdAt: { gte: since }, attachment: { equals: Prisma.DbNull } };
    if (!(await prisma.chatMessage.count({ where }))) continue;
    const source = campaignHeaderSource(campaign, templates);
    const downloaded = source ? await downloadMedia(source.url) : null;
    const attachment = downloaded ? await storeDispatchMedia(downloaded.buffer, downloaded.mime, source?.name) : null;
    if (!attachment) {
      console.warn(`[chat] imagem da campanha ${campaign.nome} indisponível para o histórico`);
      continue;
    }
    const result = await prisma.chatMessage.updateMany({ where, data: { attachment: attachment as unknown as Prisma.InputJsonValue } });
    updated += result.count;
  }
  if (updated) console.log(`[chat] imagem do modelo adicionada a ${updated} mensagens de campanha recentes`);
}
