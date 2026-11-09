import "server-only";
import { Prisma, type ChatConversation } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendList } from "@/lib/meta-whatsapp";
import { isWindowOpen } from "@/lib/chat/conversation";
import { resendAutomatic, sendAutomaticMessage } from "@/lib/chat/outbound";
import { phoneVariants } from "@/lib/chat/phone";

const QUESTION = "De 1 a 5, como você avalia o atendimento recebido hoje?";
const SCORE_LABELS = ["Muito insatisfeito", "Insatisfeito", "Neutro", "Satisfeito", "Muito satisfeito"];
const THANKS = "Agradecemos pela sua avaliação! Ela é muito importante para nós.";
const SURVEY_HOURS = 24;
const COMMENT_WINDOW_MS = 10 * 60_000;
const COMMENT_MAX = 1000;

const scoreLine = (label: string, index: number) => `${index + 1} - ${label}`;
const SURVEY_TEXT = [QUESTION, ...SCORE_LABELS.map(scoreLine)].join("\n");

/** Aceita "5", "5 - Muito satisfeito" ou só o rótulo; frase solta como "2 óculos" não vira nota. */
export function parseNpsScore(text: string) {
  const clean = text.trim().toLowerCase();
  const numbered = clean.match(/^([1-5])(?:\s*[-.):]\s*.*)?$/);
  if (numbered) return Number(numbered[1]);
  const label = SCORE_LABELS.findIndex((item) => item.toLowerCase() === clean);
  return label >= 0 ? label + 1 : null;
}

/** Roda depois do encerramento: falha aqui nunca desfaz o fechamento da conversa. */
const surveyList = (phone: string) => () => sendList(phone, {
  body: QUESTION,
  button: "Avaliar atendimento",
  rows: SCORE_LABELS.map((label, index) => ({ id: `nps_${index + 1}`, title: scoreLine(label, index) })),
});

export const isSurveyMessage = (text: string) => text.startsWith(QUESTION);

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
    const sent = await sendAutomaticMessage(conversation, SURVEY_TEXT, surveyList(conversation.phone));
    if (!sent || sent.delivery === "failed") return;
    await openSurvey(conversation, attendantId);
  } catch (error) {
    console.error("[chat] falha ao enviar pesquisa de satisfação:", error);
  }
}

/** Reenvio da pesquisa que caiu por falta de conexão. */
export async function resendSurvey(messageId: string, conversation: ChatConversation) {
  const sent = await resendAutomatic(messageId, surveyList(conversation.phone));
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
  await sendAutomaticMessage({ id: pending.conversationId, phone: pending.phone }, THANKS)
    .catch((error) => console.error("[chat] falha ao agradecer a avaliação:", error));
  return true;
}
