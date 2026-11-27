import "server-only";
import { Prisma, type ChatConversation, type NpsFeedback } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendList, sendText } from "@/lib/meta-whatsapp";
import { isWindowOpen, readChatSettings } from "@/lib/chat/conversation";
import { resendAutomatic, sendAutomaticMessage } from "@/lib/chat/outbound";
import { phoneVariants } from "@/lib/chat/phone";
import { NPS_LEGACY_SCALES, NPS_SCALE_TEXT, NPS_SCORE_EMOJIS, NPS_SCORE_LABELS as SCORE_LABELS, npsCommentPrompt, npsPrompt, npsScoreTitle, type ChatMenuSettings } from "@/lib/chat/settings";
import { NPS_LIST_FOOTER, NPS_SCALE, buildNpsList, npsListText, parseNps10, type NpsSurveyType } from "@/lib/nps-scale";
import type { ChatInteractiveList } from "@/lib/chat/types";
import { npsAttribution } from "@/lib/chat/nps-attribution";

/** Prazo para responder a nota: pesquisa do encerramento (janela aberta) e pesquisa pós-compra por modelo. */
const SURVEY_HOURS = 24;
const AUTOMATION_SURVEY_HOURS = 72;
/** Depois da nota (qualquer nota), quanto tempo o próximo texto do cliente ainda conta como comentário. */
const COMMENT_WINDOW_MS = 10 * 60_000;
const COMMENT_MAX = 1000;

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
const surveyHours = (feedback: Pick<NpsFeedback, "source">) => (feedback.source === "automacao" ? AUTOMATION_SURVEY_HOURS : SURVEY_HOURS);

/**
 * Escala antiga (1 a 5), só para pesquisas pendentes enviadas antes da mudança: toque na lista (id nps_N),
 * "5", "5 - Muito satisfeito 🤩", só o rótulo ou só o emoji. Frase solta como "2 óculos" não vira nota.
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

/** Lista interativa da escala antiga: só para reenviar uma pesquisa antiga que caiu por falta de conexão. */
const legacySurveyList = (phone: string, question: string) => () => sendList(phone, {
  body: question.slice(0, 1024),
  button: "Avaliar atendimento",
  rows: SCORE_LABELS.map((label, index) => ({ id: `nps_${index + 1}`, title: npsScoreTitle(label, index) })),
});

/** A pergunta é editável; o que marca a pesquisa no histórico é a escala no fim. */
const scaleOf = (text: string) => [NPS_LIST_FOOTER, NPS_SCALE_TEXT, ...NPS_LEGACY_SCALES].find((scale) => text.endsWith(scale));
export const isSurveyMessage = (text: string) => !!scaleOf(text);
const questionOf = (text: string) => text.slice(0, -(scaleOf(text)?.length ?? 0)).trim();
export const surveyText = (question: string) => `${question}\n${NPS_SCALE_TEXT}`;

const expirePending = (phone: string) =>
  prisma.npsFeedback.updateMany({ where: { phone: { in: phoneVariants(phone) }, status: "PENDING" }, data: { status: "EXPIRED" } });

/** Só a pesquisa que chegou ao cliente fica aguardando nota; vale a mais recente do número. */
async function openSurvey(conversation: ChatConversation, attendantId: string | null) {
  const attribution = await npsAttribution(conversation, attendantId);
  await expirePending(conversation.phone);
  await prisma.npsFeedback.create({
    data: { conversationId: conversation.id, contactId: conversation.contactId, ...attribution, queueId: conversation.queueId, phone: conversation.phone, scale: NPS_SCALE, surveyType: "ATENDIMENTO", source: "chat" },
  });
}

type NpsList = ReturnType<typeof buildNpsList>;
const interactiveOf = (list: NpsList): ChatInteractiveList => ({ type: "list", body: list.body, footer: list.footer, button: list.button, sections: [{ rows: list.rows }] });

/**
 * Pesquisa dentro da janela de 24 h: lista interativa nativa ("Avaliar agora", notas de 10 a 1; a nota 0 vai digitada).
 * Gravada no /chat como o cliente vê; o texto termina no rodapé, que marca a mensagem como pesquisa.
 */
export async function sendNpsList(conversation: Pick<ChatConversation, "id" | "phone">, list: NpsList, authorName?: string) {
  return sendAutomaticMessage(conversation, npsListText(list), () => sendList(conversation.phone, list), interactiveOf(list), authorName);
}

const contactName = async (contactId: string) => (await prisma.contact.findUnique({ where: { id: contactId }, select: { name: true } }))?.name ?? null;

export async function sendSatisfactionSurvey(conversation: ChatConversation, attendantId: string | null) {
  try {
    if (!isWindowOpen(conversation.lastInboundAt)) return;
    const settings = await readChatSettings();
    if (!settings.npsEnabled) return;
    const list = buildNpsList("ATENDIMENTO", await contactName(conversation.contactId), npsPrompt(settings));
    const sent = await sendNpsList(conversation, list);
    if (!sent || sent.delivery === "failed") return;
    await openSurvey(conversation, attendantId);
  } catch (error) {
    console.error("[chat] falha ao enviar pesquisa de satisfação:", error);
  }
}

/** Reenvio da pesquisa que caiu por falta de conexão (lista volta como lista; a antiga de 1 a 5, como lista antiga; a de texto, como texto). */
export async function resendSurvey(message: { id: string; text: string }, conversation: ChatConversation) {
  const scale = scaleOf(message.text);
  const send = scale === NPS_LIST_FOOTER
    ? () => sendList(conversation.phone, buildNpsList("ATENDIMENTO", null, questionOf(message.text)))
    : scale !== NPS_SCALE_TEXT ? legacySurveyList(conversation.phone, questionOf(message.text)) : () => sendText(conversation.phone, message.text);
  const sent = await resendAutomatic(message.id, send);
  if (sent?.delivery === "sent") await openSurvey(conversation, conversation.assigneeId);
  return sent;
}

// ---------------------------------------------------------------- Pesquisa pós-compra (automações do VMSet)

export type AutomationSurveyInput = {
  contactId: string;
  phone: string;
  surveyType: NpsSurveyType;
  orderKey: string | null;
  store?: string | null;
  seller?: string | null;
  flowId?: string | null;
};

/**
 * Reserva a pesquisa antes do envio do modelo: uma de cada tipo por pedido (índice único orderKey + surveyType),
 * inclusive entre os containers blue/green. null = este pedido já recebeu esta pesquisa.
 */
export async function reserveAutomationSurvey(input: AutomationSurveyInput) {
  if (input.orderKey && await prisma.npsFeedback.findFirst({ where: { orderKey: input.orderKey, surveyType: input.surveyType }, select: { id: true } })) return null;
  await expirePending(input.phone);
  try {
    return await prisma.npsFeedback.create({
      data: {
        contactId: input.contactId, phone: input.phone, scale: NPS_SCALE, surveyType: input.surveyType, source: "automacao",
        orderKey: input.orderKey, store: input.store?.slice(0, 120) || null, seller: input.seller?.slice(0, 120) || null, flowId: input.flowId ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
}

/** Envio do modelo falhou: libera a reserva para uma próxima tentativa. */
export const releaseAutomationSurvey = (id: string) => prisma.npsFeedback.deleteMany({ where: { id, status: "PENDING" } });

/** Conversa (de envios) onde o modelo foi registrado: a nota e o comentário do cliente ficam nela. */
export const attachSurveyConversation = (id: string, conversationId: string | null) =>
  conversationId ? prisma.npsFeedback.updateMany({ where: { id }, data: { conversationId } }) : Promise.resolve({ count: 0 });

export async function expireSurveys(now: number) {
  const [chat, automation] = await Promise.all([
    prisma.npsFeedback.updateMany({ where: { status: "PENDING", source: { not: "automacao" }, createdAt: { lt: new Date(now - SURVEY_HOURS * 3_600_000) } }, data: { status: "EXPIRED" } }),
    prisma.npsFeedback.updateMany({ where: { status: "PENDING", source: "automacao", createdAt: { lt: new Date(now - AUTOMATION_SURVEY_HOURS * 3_600_000) } }, data: { status: "EXPIRED" } }),
  ]);
  return chat.count + automation.count;
}

// ---------------------------------------------------------------- Respostas do cliente

/** Mensagem automática da pesquisa: na conversa dela (histórico do /chat) ou direto no número. */
async function say(feedback: Pick<NpsFeedback, "conversationId" | "phone">, text: string) {
  try {
    if (feedback.conversationId) await sendAutomaticMessage({ id: feedback.conversationId, phone: feedback.phone }, text);
    else await sendText(feedback.phone, text);
  } catch (error) {
    console.error("[chat] falha ao responder a avaliação:", error);
  }
}

async function thank(feedback: Pick<NpsFeedback, "conversationId" | "phone">, settings: ChatMenuSettings) {
  // Agradecimento em branco na configuração: a nota fica gravada sem resposta ao cliente.
  const thanks = settings.npsThanksText.trim();
  if (thanks) await say(feedback, thanks);
}

/** Grava a mensagem do cliente na conversa da pesquisa; false = já gravada (reentrega do webhook). */
async function storeCustomerMessage(conversationId: string | null, reply: { externalId: string; text: string; receivedAt: Date }) {
  if (!conversationId) return true;
  try {
    await prisma.chatMessage.create({ data: { conversationId, author: "customer", text: reply.text, externalId: reply.externalId, createdAt: reply.receivedAt } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

/** Nenhum cliente nem atendente escreveu na conversa depois da pesquisa (ou da nota): a próxima resposta é dela. */
async function surveyHasTheFloor(conversationId: string, since: Date) {
  const later = await prisma.chatMessage.findFirst({ where: { conversationId, author: { in: ["customer", "agent"] }, createdAt: { gt: since } }, select: { id: true } });
  return !later;
}

/**
 * Comentário opcional: o primeiro texto até 10 minutos depois de qualquer nota (inclusive 9 e 10), quando o convite
 * ao comentário está configurado. Não há flag gravada; passado o prazo, a mensagem segue o fluxo normal.
 */
async function recordComment(reply: { externalId: string; text: string; receivedAt: Date }, phones: string[]) {
  const comment = reply.text.trim().slice(0, COMMENT_MAX);
  if (!comment) return false;
  const settings = await readChatSettings();
  if (!npsCommentPrompt(settings)) return false;
  const feedback = await prisma.npsFeedback.findFirst({
    where: { phone: { in: phones }, status: "ANSWERED", comment: null, answeredAt: { gte: new Date(reply.receivedAt.getTime() - COMMENT_WINDOW_MS) } },
    orderBy: { answeredAt: "desc" },
  });
  if (!feedback) return false;
  // Com conversa aberta, o texto é para o atendente (salvo quando a pesquisa saiu nessa conversa e ninguém falou depois da nota).
  const open = await prisma.chatConversation.findFirst({ where: { phone: { in: phones }, closedAt: null }, select: { id: true } });
  if (open && !(open.id === feedback.conversationId && feedback.answeredAt && (await surveyHasTheFloor(open.id, feedback.answeredAt)))) return false;
  if (!(await storeCustomerMessage(feedback.conversationId, reply))) return true;
  const saved = await prisma.npsFeedback.updateMany({ where: { id: feedback.id, comment: null }, data: { comment } });
  if (saved.count > 0) await thank(feedback, settings);
  return true;
}

/**
 * Devolve true quando a mensagem é a nota: ela fica na conversa da pesquisa e não abre atendimento.
 * Qualquer outra resposta encerra a pesquisa e segue o fluxo normal, para nada se perder.
 */
export async function recordSurveyReply(reply: { externalId: string; phone: string; text: string; choiceId?: string | null; isText: boolean; receivedAt: Date }) {
  const phones = phoneVariants(reply.phone);
  const pending = await prisma.npsFeedback.findFirst({ where: { phone: { in: phones }, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  if (!pending) return reply.isText ? recordComment(reply, phones) : false;

  // Com conversa aberta, um "2" responde ao atendente, não à pesquisa. Exceções: o toque na lista da pesquisa
  // e o número digitado logo depois da lista enviada nessa mesma conversa (janela de 24 h aberta).
  const open = await prisma.chatConversation.findFirst({ where: { phone: { in: phones }, closedAt: null }, select: { id: true } });
  const fresh = reply.receivedAt.getTime() - pending.createdAt.getTime() < surveyHours(pending) * 3_600_000;
  const legacy = pending.scale !== NPS_SCALE;
  const tapped = !!reply.choiceId && /^nps_\d{1,2}$/.test(reply.choiceId);
  const surveyTurn = !open || tapped || (open.id === pending.conversationId && (await surveyHasTheFloor(open.id, pending.createdAt)));
  const score = fresh && surveyTurn ? (legacy ? parseNpsScore(reply.text, reply.choiceId) : parseNps10(reply.text, reply.choiceId)) : null;
  if (score === null) {
    await prisma.npsFeedback.update({ where: { id: pending.id }, data: { status: "EXPIRED" } });
    return false;
  }

  if (!(await storeCustomerMessage(pending.conversationId, reply))) return true;
  await prisma.npsFeedback.update({ where: { id: pending.id }, data: { status: "ANSWERED", score, answeredAt: reply.receivedAt } });
  const settings = await readChatSettings();
  // Qualquer nota recebe o convite ao comentário opcional; o agradecimento sai depois do comentário.
  const askComment = npsCommentPrompt(settings);
  if (askComment) await say(pending, askComment);
  else await thank(pending, settings);
  return true;
}
