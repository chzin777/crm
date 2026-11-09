import "server-only";
import { Prisma, type ChatConversation } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendList } from "@/lib/meta-whatsapp";
import { isWindowOpen, readChatSettings } from "@/lib/chat/conversation";
import { resendAutomatic, sendAutomaticMessage } from "@/lib/chat/outbound";
import { phoneVariants } from "@/lib/chat/phone";
import { NPS_SCALE_TEXT, NPS_SCORE_LABELS as SCORE_LABELS, npsPrompt, npsScoreLine as scoreLine } from "@/lib/chat/settings";

const SURVEY_HOURS = 24;
const COMMENT_WINDOW_MS = 10 * 60_000;
const COMMENT_MAX = 1000;

/** Aceita "5", "5 - Muito satisfeito" ou só o rótulo; frase solta como "2 óculos" não vira nota. */
export function parseNpsScore(text: string) {
  const clean = text.trim().toLowerCase();
  const numbered = clean.match(/^([1-5])(?:\s*[-.):]\s*.*)?$/);
  if (numbered) return Number(numbered[1]);
  const label = SCORE_LABELS.findIndex((item) => item.toLowerCase() === clean);
  return label >= 0 ? label + 1 : null;
}

/** Roda depois do encerramento: falha aqui nunca desfaz o fechamento da conversa. */
const surveyList = (phone: string, question: string) => () => sendList(phone, {
  body: question.slice(0, 1024),
  button: "Avaliar atendimento",
  rows: SCORE_LABELS.map((label, index) => ({ id: `nps_${index + 1}`, title: scoreLine(label, index) })),
});

/** A pergunta é editável; o que marca a pesquisa no histórico é a escala no fim. */
export const isSurveyMessage = (text: string) => text.endsWith(NPS_SCALE_TEXT);
const questionOf = (text: string) => text.slice(0, -NPS_SCALE_TEXT.length).trim();

/** Só a pesquisa que chegou ao cliente fica aguardando nota; vale a mais recente do número. */
async function openSurvey(conversation: ChatConversation, attendantId: string | null) {
  await prisma.npsFeedback.updateMany({ where: { phone: { in: phoneVariants(conversation.phone) }, status: "PENDING" }, data: { status: "EXPIRED" } });
  await prisma.npsFeedback.create({
    data: { conversationId: conversation.id, contactId: conversation.contactId, attendantId, queueId: conversation.queueId, phone: conversation.phone },
  });
}

export async function sendSatisfactionSurvey(conversation: ChatConversation, attendantId: string | null) {
  try {
    if (!isWindowOpen(conversation.lastInboundAt)) return;
    const settings = await readChatSettings();
    if (!settings.npsEnabled) return;
    const question = npsPrompt(settings);
    const sent = await sendAutomaticMessage(conversation, `${question}\n${NPS_SCALE_TEXT}`, surveyList(conversation.phone, question));
    if (!sent || sent.delivery === "failed") return;
    await openSurvey(conversation, attendantId);
  } catch (error) {
    console.error("[chat] falha ao enviar pesquisa de satisfação:", error);
  }
}

/** Reenvio da pesquisa que caiu por falta de conexão. */
export async function resendSurvey(message: { id: string; text: string }, conversation: ChatConversation) {
  const sent = await resendAutomatic(message.id, surveyList(conversation.phone, questionOf(message.text)));
  if (sent?.delivery === "sent") await openSurvey(conversation, conversation.assigneeId);
  return sent;
}

export async function expireSurveys(now: number) {
  const { count } = await prisma.npsFeedback.updateMany({
    where: { status: "PENDING", createdAt: { lt: new Date(now - SURVEY_HOURS * 3_600_000) } },
    data: { status: "EXPIRED" },
  });
  return count;
}

/** Texto logo depois da nota vira comentário, mas segue o fluxo: pode ser um novo pedido do cliente. */
async function saveComment(phones: string[], text: string, receivedAt: Date) {
  const comment = text.trim().slice(0, COMMENT_MAX);
  if (!comment || parseNpsScore(comment) !== null) return;
  await prisma.npsFeedback.updateMany({
    where: { phone: { in: phones }, status: "ANSWERED", comment: null, answeredAt: { gte: new Date(receivedAt.getTime() - COMMENT_WINDOW_MS) } },
    data: { comment },
  });
}

/**
 * Devolve true quando a mensagem é a nota: ela fica na conversa encerrada e não abre atendimento.
 * Qualquer outra resposta encerra a pesquisa e segue o fluxo normal, para nada se perder.
 */
export async function recordSurveyReply(reply: { externalId: string; phone: string; text: string; isText: boolean; receivedAt: Date }) {
  const phones = phoneVariants(reply.phone);
  const pending = await prisma.npsFeedback.findFirst({ where: { phone: { in: phones }, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  if (!pending) {
    if (reply.isText) await saveComment(phones, reply.text, reply.receivedAt);
    return false;
  }

  // Com conversa aberta, um "2" responde ao atendente, não à pesquisa.
  const open = await prisma.chatConversation.findFirst({ where: { phone: { in: phones }, closedAt: null }, select: { id: true } });
  const fresh = reply.receivedAt.getTime() - pending.createdAt.getTime() < SURVEY_HOURS * 3_600_000;
  const score = fresh && !open && pending.conversationId ? parseNpsScore(reply.text) : null;
  if (score === null || !pending.conversationId) {
    await prisma.npsFeedback.update({ where: { id: pending.id }, data: { status: "EXPIRED" } });
    return false;
  }

  try {
    await prisma.chatMessage.create({
      data: { conversationId: pending.conversationId, author: "customer", text: reply.text, externalId: reply.externalId, createdAt: reply.receivedAt },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return true;
    throw error;
  }
  await prisma.npsFeedback.update({ where: { id: pending.id }, data: { status: "ANSWERED", score, answeredAt: reply.receivedAt } });
  // Agradecimento em branco na configuração: a nota fica gravada sem resposta ao cliente.
  const thanks = (await readChatSettings()).npsThanksText.trim();
  if (thanks) {
    await sendAutomaticMessage({ id: pending.conversationId, phone: pending.phone }, thanks)
      .catch((error) => console.error("[chat] falha ao agradecer a avaliação:", error));
  }
  return true;
}
