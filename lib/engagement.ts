import "server-only";
import { prisma } from "@/lib/prisma";
import { phoneVariants } from "@/lib/chat/phone";

/** Pontos do score de engajamento no WhatsApp. */
export const ENGAGEMENT_POINTS = { read: 5, reply: 15, unread: -5 } as const;
/** Campanha sem leitura nem resposta depois desse prazo tira pontos. */
export const UNREAD_AFTER_MS = 72 * 60 * 60 * 1000;
/**
 * Erros da Meta que significam número sem WhatsApp/indisponível para entrega.
 * 131026 = "Message undeliverable" (número sem conta no WhatsApp, termos não aceitos ou app sem suporte).
 * O 131047 NÃO entra: é só a janela de 24 h fechada (o número existe).
 */
export const INVALID_NUMBER_CODES = new Set([131026]);

export async function addEngagement(contactId: string | null | undefined, delta: number) {
  if (!contactId || !delta) return;
  await prisma.contact
    .updateMany({ where: { id: contactId }, data: { engagementScore: { increment: delta }, engagementUpdatedAt: new Date() } })
    .catch((error) => console.error("[engagement] atualizar score:", error));
}

/** Número sem WhatsApp: todos os cadastros do telefone saem dos disparos pagos. */
export async function markInvalidWhatsApp(phone: string, reason: string) {
  const result = await prisma.contact.updateMany({
    where: { phone: { in: phoneVariants(phone) }, invalidWhatsApp: false },
    data: { invalidWhatsApp: true, invalidWhatsAppAt: new Date(), invalidWhatsAppReason: reason.slice(0, 200) },
  });
  if (result.count > 0) console.log(`[engagement] ${phone}: marcado como sem WhatsApp (${result.count} cadastro(s)) — ${reason}`);
}

/** O cliente escreveu: o número tem WhatsApp, volta a poder receber campanhas. */
export async function clearInvalidWhatsApp(phone: string) {
  await prisma.contact.updateMany({
    where: { phone: { in: phoneVariants(phone) }, invalidWhatsApp: true },
    data: { invalidWhatsApp: false, invalidWhatsAppAt: null, invalidWhatsAppReason: null },
  });
}

/**
 * −5 por envio de campanha que passou 72 h sem leitura nem resposta. Cada envio é avaliado uma vez
 * (`engagementPenalizedAt`); `SKIP LOCKED` evita contar duas vezes com os relógios das duas cores do blue/green.
 */
export async function penalizeUnreadCampaigns(now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - UNREAD_AFTER_MS);
  const rows = await prisma.$queryRaw<{ affected: number }[]>`
    WITH due AS (
      UPDATE "CampaignMessage" SET "engagementPenalizedAt" = ${now}
      WHERE "id" IN (
        SELECT "id" FROM "CampaignMessage"
        WHERE "engagementPenalizedAt" IS NULL AND "sentAt" IS NOT NULL AND "sentAt" < ${cutoff}
        ORDER BY "sentAt" LIMIT 5000 FOR UPDATE SKIP LOCKED
      )
      RETURNING "contactId", "readAt", "repliedAt", "status"
    ), unread AS (
      SELECT "contactId", count(*)::int AS n FROM due
      WHERE "contactId" IS NOT NULL AND "readAt" IS NULL AND "repliedAt" IS NULL AND "status" IN ('sent', 'delivered')
      GROUP BY "contactId"
    ), applied AS (
      UPDATE "Contact" c SET "engagementScore" = c."engagementScore" + ${ENGAGEMENT_POINTS.unread} * u.n, "engagementUpdatedAt" = ${now}
      FROM unread u WHERE c."id" = u."contactId"
      RETURNING c."id"
    )
    SELECT count(*)::int AS affected FROM applied
  `;
  return rows[0]?.affected ?? 0;
}

/**
 * Leads frios: o contato recebeu as últimas `lastCampaigns` campanhas (enviadas há mais de 72 h) e não leu nem
 * respondeu nenhuma. Devolve os ids, entre os informados, que devem ficar fora do disparo.
 */
export async function coldContactIds(contactIds: string[], lastCampaigns: number, now: Date = new Date()) {
  if (contactIds.length === 0 || lastCampaigns < 1) return new Set<string>();
  const cutoff = new Date(now.getTime() - UNREAD_AFTER_MS);
  const rows = await prisma.$queryRaw<{ contactId: string }[]>`
    SELECT "contactId" FROM (
      SELECT "contactId", "readAt", "repliedAt",
        row_number() OVER (PARTITION BY "contactId" ORDER BY "sentAt" DESC) AS rn
      FROM "CampaignMessage"
      WHERE "contactId" = ANY(${contactIds}::text[]) AND "sentAt" IS NOT NULL AND "sentAt" < ${cutoff}
        AND "status" <> 'failed' AND "campaignId" NOT LIKE 'bulk:%'
    ) recent
    WHERE rn <= ${lastCampaigns}
    GROUP BY "contactId"
    HAVING count(*) >= ${lastCampaigns} AND bool_and("readAt" IS NULL AND "repliedAt" IS NULL)
  `;
  return new Set(rows.map((row) => row.contactId));
}
