import "server-only";
import { Prisma, type ChatConversation } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendList } from "@/lib/meta-whatsapp";
import { isWindowOpen, readChatSettings } from "@/lib/chat/conversation";
import { resendAutomatic, sendAutomaticMessage } from "@/lib/chat/outbound";
import { phoneVariants } from "@/lib/chat/phone";
import { NPS_LEGACY_SCALES, NPS_SCALE_TEXT, NPS_SCORE_EMOJIS, NPS_SCORE_LABELS as SCORE_LABELS, npsPrompt, npsScoreTitle, type ChatMenuSettings } from "@/lib/chat/settings";

const SURVEY_HOURS = 24;
/** Depois de uma nota baixa, quanto tempo o próximo texto do cliente ainda conta como comentário. */
const COMMENT_WINDOW_MS = 5 * 60_000;
const LOW_SCORE = 4;
const COMMENT_MAX = 1000;

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

/**
 * Aceita o toque na lista (id nps_N), "5", "5 - Muito satisfeito 🤩", só o rótulo ou só o emoji.
 * Frase solta como "2 óculos" não vira nota.
 */
export function parseNpsScore(text: string, choiceId?: string | null) {
  const picked = choiceId?.match(/^nps_([1-5])$/);
  if (picked) return Number(picked[1]);
  const raw = text.trim();
  const emoji = NPS_SCORE_EMOJIS.indexOf(raw.replace(/\u{FE0F}/gu, ""));
  if (emoji >= 0) return emoji + 1;
  const clean = raw.replace(EMOJI, "").trim().toLowerCase();
  const numbered = clean.match(/^([1-5])(?:\s*[-.):]\s*.*)?$/);
  if (numbered) return Number(numbered[1]);
  const label = SCORE_LABELS.findIndex((item) => item.toLowerCase() === clean);
  return label >= 0 ? label + 1 : null;
}

/** Roda depois do encerramento: falha aqui nunca desfaz o fechamento da conversa. */
const surveyList = (phone: string, question: string) => () => sendList(phone, {
  body: question.slice(0, 1024),
  button: "Avaliar atendimento",
  rows: SCORE_LABELS.map((label, index) => ({ id: `nps_${index + 1}`, title: npsScoreTitle(label, index) })),
});

/** A pergunta é editável; o que marca a pesquisa no histórico é a escala no fim. */
const scaleOf = (text: string) => [NPS_SCALE_TEXT, ...NPS_LEGACY_SCALES].find((scale) => text.endsWith(scale));
export const isSurveyMessage = (text: string) => !!scaleOf(text);
const questionOf = (text: string) => text.slice(0, -(scaleOf(text)?.length ?? 0)).trim();

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

async function thank(conversationId: string, phone: string, settings: ChatMenuSettings) {
  // Agradecimento em branco na configuração: a nota fica gravada sem resposta ao cliente.
  const thanks = settings.npsThanksText.trim();
  if (!thanks) return;
  await sendAutomaticMessage({ id: conversationId, phone }, thanks)
    .catch((error) => console.error("[chat] falha ao agradecer a avaliação:", error));
}

/**
 * Espera de comentário: nota abaixo de 4, sem comentário e há menos de 5 minutos. Não há flag
 * gravada; passado o prazo, a mensagem segue o fluxo normal e abre atendimento.
 */
async function recordComment(reply: { externalId: string; text: string; receivedAt: Date }, phones: string[]) {
  const comment = reply.text.trim().slice(0, COMMENT_MAX);
  if (!comment) return false;
  const settings = await readChatSettings();
  if (!settings.npsCommentText.trim()) return false;
  const feedback = await prisma.npsFeedback.findFirst({
    where: {
      phone: { in: phones },
      status: "ANSWERED",
      score: { lt: LOW_SCORE },
      comment: null,
      conversationId: { not: null },
      answeredAt: { gte: new Date(reply.receivedAt.getTime() - COMMENT_WINDOW_MS) },
    },
    orderBy: { answeredAt: "desc" },
  });
  if (!feedback?.conversationId) return false;

  try {
    await prisma.chatMessage.create({
      data: { conversationId: feedback.conversationId, author: "customer", text: reply.text, externalId: reply.externalId, createdAt: reply.receivedAt },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return true;
    throw error;
  }
  const saved = await prisma.npsFeedback.updateMany({ where: { id: feedback.id, comment: null }, data: { comment } });
  if (saved.count > 0) await thank(feedback.conversationId, feedback.phone, settings);
  return true;
}

/**
 * Devolve true quando a mensagem é a nota: ela fica na conversa encerrada e não abre atendimento.
 * Qualquer outra resposta encerra a pesquisa e segue o fluxo normal, para nada se perder.
 */
export async function recordSurveyReply(reply: { externalId: string; phone: string; text: string; choiceId?: string | null; isText: boolean; receivedAt: Date }) {
  const phones = phoneVariants(reply.phone);
  const pending = await prisma.npsFeedback.findFirst({ where: { phone: { in: phones }, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  if (!pending) return reply.isText ? recordComment(reply, phones) : false;

  // Com conversa aberta, um "2" responde ao atendente, não à pesquisa.
  const open = await prisma.chatConversation.findFirst({ where: { phone: { in: phones }, closedAt: null }, select: { id: true } });
  const fresh = reply.receivedAt.getTime() - pending.createdAt.getTime() < SURVEY_HOURS * 3_600_000;
  const score = fresh && !open && pending.conversationId ? parseNpsScore(reply.text, reply.choiceId) : null;
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
  const settings = await readChatSettings();
  const askComment = settings.npsCommentText.trim();
  // Nota baixa pede o motivo; o agradecimento sai depois do comentário.
  if (score < LOW_SCORE && askComment) {
    await sendAutomaticMessage({ id: pending.conversationId, phone: pending.phone }, askComment)
      .catch((error) => console.error("[chat] falha ao pedir comentário da avaliação:", error));
  } else {
    await thank(pending.conversationId, pending.phone, settings);
  }
  return true;
}
