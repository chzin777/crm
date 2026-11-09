import "server-only";
import { prisma } from "@/lib/prisma";

/** Marca a conversa encerrada que só guarda envios ativos (campanha/envio em massa) a quem ainda não respondeu. */
export const DISPATCH_TAG = "disparo";
/** Resposta até este prazo reabre a conversa do envio, para o atendente ver o que o cliente está respondendo. */
export const DISPATCH_REOPEN_MS = 30 * 24 * 60 * 60 * 1000;

/** Telefone no formato das conversas do chat (55 + DDD + número). */
export function chatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
}

const fill =(text: string, values: string[]) => text.replace(/\{\{(\d+)\}\}/g, (_match, index: string) => values[Number(index) - 1] ?? "");

/** Texto do modelo como o cliente recebeu: cabeçalho de texto (se houver) + corpo com as variáveis preenchidas. */
export function renderTemplateText(template: { body?: string; headerFormat?: string | null; headerText?: string } | undefined, fallbackName: string, params: string[]) {
  const body = fill(template?.body ?? fallbackName, params);
  const header = template?.headerFormat === "TEXT" && template.headerText ? template.headerText : "";
  return header ? `${header}\n\n${body}` : body;
}

/**
 * Grava no /chat a mensagem enviada por campanha ou envio em massa.
 * Conversa aberta: entra nela. Sem conversa aberta: vai para a conversa encerrada de envios do contato
 * (criada se preciso), que não aparece nas filas; se o cliente responder, ela é reaberta (openConversationFor).
 */
export async function recordDispatchInChat(input: {
  contactId: string;
  phone: string;
  text: string;
  externalId: string | null;
  authorName: string;
  campaignId?: string;
  campaignName?: string;
  sentAt?: Date;
}) {
  const sentAt = input.sentAt ?? new Date();
  try {
    let conversationId: string | null = (await prisma.chatConversation.findUnique({ where: { openKey: input.contactId }, select: { id: true } }))?.id ?? null;
    if (!conversationId) {
      // Reaproveita a conversa de envios mais recente que o cliente ainda não respondeu.
      const holder = await prisma.chatConversation.findFirst({
        where: { contactId: input.contactId, status: "closed", tags: { has: DISPATCH_TAG }, messages: { none: { author: "customer" } } },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      conversationId = holder?.id ?? (await prisma.chatConversation.create({
        data: {
          contactId: input.contactId,
          phone: input.phone,
          status: "closed",
          closedAt: sentAt,
          subject: input.authorName.slice(0, 120),
          tags: [DISPATCH_TAG],
          campaignId: input.campaignId ?? null,
          campaignName: input.campaignName ?? null,
          lastMessageAt: sentAt,
        },
        select: { id: true },
      })).id;
      if (holder) {
        await prisma.chatConversation.update({
          where: { id: holder.id },
          data: { closedAt: sentAt, subject: input.authorName.slice(0, 120), phone: input.phone, ...(input.campaignId ? { campaignId: input.campaignId, campaignName: input.campaignName ?? null } : {}) },
        });
      }
    }

    await prisma.chatMessage.create({
      data: {
        conversationId,
        author: "agent",
        authorName: input.authorName.slice(0, 120),
        text: input.text,
        delivery: "sent",
        createdAt: sentAt,
        // O webhook atualiza entregue/lida por este id.
        ...(input.externalId ? { externalId: input.externalId } : {}),
      },
    });
    await prisma.chatConversation.updateMany({
      where: { id: conversationId, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: sentAt } }] },
      data: { lastMessageAt: sentAt },
    });
  } catch (error) {
    // O envio já saiu: falha ao registrar no chat não pode interromper o disparo.
    console.error(`[chat] falha ao registrar envio no histórico de ${input.contactId}:`, error);
  }
}
