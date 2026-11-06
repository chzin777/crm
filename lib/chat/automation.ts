import "server-only";
import { prisma } from "@/lib/prisma";
import { firstDispatch, isBlocked } from "@/lib/chat/conversation";
import { attendByMenu, readMenuState, saveMenuState } from "@/lib/chat/menu";
import type { RecordedInbound } from "@/lib/chat/inbound";
import { sendAutomaticMessage } from "@/lib/chat/outbound";
import { fillVariables } from "@/lib/chat/text";

const AUTOMATIC_GAP_MS = 3 * 60 * 1000;

const GREETINGS = new Set(["oi", "ola", "opa", "eae", "e ai", "fala", "bom dia", "boa tarde", "boa noite", "tudo bem", "tudo bom", "como vai", "oi bom dia", "ola bom dia", "oi boa tarde", "ola boa tarde", "oi boa noite", "ola boa noite"]);

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const onlyWords = (text: string) => normalize(text).replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

async function answerByQuickReply(entry: { conversationId: string; phone: string; queueId: string | null; text: string; firstMessage: boolean; customerName: string; queueName: string | null }) {
  const candidates = await prisma.chatQuickReply.findMany({
    where: { automatic: true, ...(entry.queueId ? { OR: [{ queueId: null }, { queueId: entry.queueId }] } : {}) },
    orderBy: [{ queueId: { sort: "asc", nulls: "last" } }, { title: "asc" }],
  });
  const text = normalize(entry.text);
  const withTriggers = candidates.filter((item) => item.triggers.length > 0);
  const match =
    withTriggers.find((item) => item.triggers.some((trigger) => text.includes(normalize(trigger).trim()))) ??
    (entry.firstMessage && GREETINGS.has(onlyWords(entry.text)) ? candidates.find((item) => item.triggers.length === 0) : undefined);
  if (!match) return false;

  const recent = await prisma.chatMessage.findFirst({
    where: { conversationId: entry.conversationId, author: "bot", createdAt: { gt: new Date(Date.now() - AUTOMATIC_GAP_MS) } },
    select: { id: true },
  });
  if (recent) return false;
  if (!(await firstDispatch(`auto:${entry.conversationId}:${match.id}`))) return false;

  const phrases = [match.text, ...match.variations].map((item) => item.trim()).filter(Boolean);
  const phrase = phrases[Math.floor(Math.random() * phrases.length)] ?? match.text;
  await sendAutomaticMessage({ id: entry.conversationId, phone: entry.phone }, fillVariables(phrase, { customer: entry.customerName, queue: entry.queueName }));
  return true;
}

/** Depois de gravar a mensagem. Conversa com dono nunca recebe resposta automática. */
export async function runAutomation(recorded: RecordedInbound) {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: recorded.conversationId },
    include: { contact: { select: { name: true } }, queue: { select: { name: true } } },
  });
  if (!conversation || conversation.assigneeId || conversation.closedAt) return;
  if (await isBlocked(conversation.phone)) return;

  const inboundCount = await prisma.chatMessage.count({ where: { conversationId: conversation.id, author: "customer" } });
  const firstMessage = inboundCount === 1;

  const handled = await attendByMenu({ conversation, customerName: conversation.contact.name, text: recorded.text, firstMessage });
  if (handled) return;

  const answered = await answerByQuickReply({
    conversationId: conversation.id,
    phone: conversation.phone,
    queueId: conversation.queueId,
    text: recorded.text,
    firstMessage,
    customerName: conversation.contact.name,
    queueName: conversation.queue?.name ?? null,
  });

  if (!answered && conversation.status === "bot") {
    const state = readMenuState(conversation.menuState);
    state.stopped = true;
    await saveMenuState(conversation.id, state);
    await prisma.chatConversation.update({ where: { id: conversation.id }, data: { status: "waiting", waitingSince: new Date() } });
  }
}
