import "server-only";
import { prisma } from "@/lib/prisma";
import { addSystemMessage, firstDispatch, isWindowOpen } from "@/lib/chat/conversation";
import { closeConversation } from "@/lib/chat/actions";
import { readMenuState, saveMenuState } from "@/lib/chat/menu";
import { hoursFor } from "@/lib/chat/operations";
import { sendAutomaticMessage } from "@/lib/chat/outbound";
import { describeSchedule, GLOBAL_HOURS_SCOPE, isOpenAt, sanitizeSchedule } from "@/lib/chat/hours";
import { fillVariables } from "@/lib/chat/text";
import { formatBr } from "@/lib/br-time";
import { aiConfigured, aiJson, AiError } from "@/lib/ai/openai";
import { BRAND_RULES, catalog, conversationContext } from "@/lib/ai/assist";
import { readAiSettings, readAiStatus } from "@/lib/ai/store";
import { aiShouldAttend, asksForHuman, type AiSettings } from "@/lib/ai/settings";
import type { ChatConversation } from "@/generated/prisma/client";

/** Nome gravado nas mensagens da IA (o atendimento vê quem respondeu). */
export const AI_AUTHOR = "Assistente IA";
/** Marca da mensagem de sistema da transferência: depois dela a IA não volta a responder nesta conversa. */
export const AI_HANDOFF_MARK = "IA transferiu o atendimento";
/** Espera curta para juntar mensagens seguidas do cliente numa só resposta. */
const DEBOUNCE_MS = 6_000;
const CREDIT_RETRY_MS = 10 * 60 * 1000;

type AgentDecision = { reply?: string; action?: "reply" | "handoff" | "resolved"; reason?: string; queue?: string };

const handedOff = (conversationId: string) =>
  prisma.chatMessage.findFirst({ where: { conversationId, author: "system", text: { startsWith: AI_HANDOFF_MARK } }, select: { id: true } }).then(Boolean);

/**
 * Chamado pelo fluxo automático depois de gravar a mensagem. Devolve true quando a IA assume
 * (o menu e o aviso de fora do horário não rodam); a resposta sai em segundo plano.
 */
export async function aiTakeOver(conversation: ChatConversation, messageId: string) {
  if (!aiConfigured()) return false;
  const settings = await readAiSettings();
  if (!settings.autonomousEnabled) return false;
  const now = new Date();
  const rule = await hoursFor(conversation.queueId);
  const storeOpen = !rule || isOpenAt(rule, now);
  if (!aiShouldAttend(settings, conversation, now, storeOpen)) return false;
  if (await handedOff(conversation.id)) return false;

  // Sem crédito, a conversa segue o fluxo normal em vez de ficar sem resposta.
  const status = await readAiStatus();
  if (status.creditExhausted && status.lastErrorAt && now.getTime() - new Date(status.lastErrorAt).getTime() < CREDIT_RETRY_MS) return false;

  // O cliente escreveu: aviso de silêncio e fechamento pendentes perdem o efeito.
  const state = readMenuState(conversation.menuState);
  if (state.warnedAt || state.closeAt) {
    state.warnedAt = null;
    state.closeAt = null;
    state.closePhrase = null;
    await saveMenuState(conversation.id, state);
  }

  setTimeout(() => {
    void respond(conversation.id, messageId).catch((error) => console.error("[ai] atendimento autônomo:", error));
  }, DEBOUNCE_MS);
  console.log(`[ai] ${conversation.id}: assumida pela IA (${conversation.status})`);
  return true;
}

async function knowledge(settings: AiSettings) {
  const parts: string[] = [];
  if (settings.useStores) {
    const stores = await prisma.store.findMany({ where: { active: true }, orderBy: { number: "asc" }, select: { name: true, address: true, addressNumber: true, city: true, state: true, neighborhoods: true } });
    if (stores.length) {
      parts.push(`Lojas:\n${stores.map((store) => `- ${store.name}: ${[store.address && `${store.address}${store.addressNumber ? `, ${store.addressNumber}` : ""}`, store.neighborhoods[0], store.city && `${store.city}${store.state ? `/${store.state}` : ""}`].filter(Boolean).join(" · ") || "endereço não cadastrado"}`).join("\n")}`);
    }
  }
  if (settings.useOperatingHours) {
    const rows = await prisma.operatingHours.findMany({ where: { enabled: true }, select: { scope: true, schedule: true } });
    const queues = await prisma.chatQueue.findMany({ where: { id: { in: rows.map((row) => row.scope) } }, select: { id: true, name: true } });
    const lines = rows.map((row) => `- ${row.scope === GLOBAL_HOURS_SCOPE ? "Atendimento" : `Fila ${queues.find((queue) => queue.id === row.scope)?.name ?? "?"}`}: ${describeSchedule(sanitizeSchedule(row.schedule))}`);
    if (lines.length) parts.push(`Horário de atendimento (Brasília):\n${lines.join("\n")}`);
  }
  for (const topic of settings.topics.filter((item) => item.enabled && item.content.trim())) parts.push(`${topic.title}:\n${topic.content.trim()}`);
  if (settings.canQuotePrices) {
    const products = await catalog();
    if (products) parts.push(`Preços médios praticados (use só como referência "a partir de", confirmando na loja):\n${products}`);
  }
  return parts.join("\n\n");
}

function rules(settings: AiSettings, queueNames: string[]) {
  const handoff = [
    "Transfira para uma pessoa (action \"handoff\") quando:",
    "- o cliente pedir para falar com uma pessoa;",
    settings.handoffOnComplaint ? "- o cliente reclamar, estiver irritado ou relatar problema com pedido, produto ou atendimento;" : "",
    settings.handoffOnPurchaseIntent ? "- o cliente quiser fechar uma compra, fazer orçamento com receita ou negociar condições;" : "",
    settings.handoffWhenUnsure ? "- a resposta não estiver nas informações abaixo ou você não tiver certeza;" : "",
  ].filter(Boolean);
  return [
    BRAND_RULES,
    `Você é ${settings.agentName}, assistente virtual que atende clientes pelo WhatsApp. Se for a primeira resposta da conversa, apresente-se brevemente como assistente virtual.`,
    "Responda só com base nas informações abaixo e no histórico do cliente. Não prometa o que não está escrito aqui.",
    settings.useCustomerOrders ? "Você pode informar ao cliente dados dos pedidos dele que aparecem no histórico do ERP (data, loja, situação)." : "Não comente pedidos ou compras anteriores do cliente.",
    settings.canQuotePrices ? "" : "Não informe preços nem valores: diga que a loja passa o orçamento.",
    handoff.join("\n"),
    settings.closeWhenResolved ? "Use action \"resolved\" quando o cliente confirmar que a dúvida foi resolvida ou se despedir agradecendo; nesse caso a resposta deve ser uma despedida curta." : "",
    settings.extraInstructions.trim() ? `Instruções da empresa:\n${settings.extraInstructions.trim()}` : "",
    settings.aiChoosesQueue && queueNames.length ? `Filas disponíveis para transferência: ${queueNames.join(", ")}. Em "queue", indique a mais adequada (ou vazio).` : "",
    `Responda SEMPRE em JSON: {"reply": "mensagem ao cliente (vazia só se for transferir sem falar)", "action": "reply" | "handoff" | "resolved", "reason": "motivo curto para a equipe", "queue": "nome da fila ou vazio"}.`,
  ].filter(Boolean).join("\n\n");
}

async function handoff(conversation: ChatConversation, settings: AiSettings, reason: string, queueName?: string) {
  const contact = await prisma.contact.findUnique({ where: { id: conversation.contactId }, select: { name: true } });
  let queueId = settings.handoffQueueId || conversation.queueId;
  if (!settings.handoffQueueId && settings.aiChoosesQueue && queueName) {
    const match = await prisma.chatQueue.findFirst({ where: { archivedAt: null, name: { equals: queueName.trim(), mode: "insensitive" } }, select: { id: true } });
    if (match) queueId = match.id;
  }
  const queue = queueId ? await prisma.chatQueue.findUnique({ where: { id: queueId }, select: { id: true, name: true, archivedAt: true } }) : null;
  const target = queue && !queue.archivedAt ? queue : null;

  if (settings.handoffMessage.trim() && isWindowOpen(conversation.lastInboundAt)) {
    await sendAutomaticMessage(conversation, fillVariables(settings.handoffMessage, { customer: contact?.name, queue: target?.name }), undefined, undefined, AI_AUTHOR);
  }
  const state = readMenuState(conversation.menuState);
  state.stopped = true;
  await saveMenuState(conversation.id, state);
  await prisma.chatConversation.update({
    where: { id: conversation.id },
    data: { status: "waiting", waitingSince: conversation.waitingSince ?? new Date(), queueId: target?.id ?? conversation.queueId },
  });
  await addSystemMessage(conversation.id, `${AI_HANDOFF_MARK}${target ? ` para a fila ${target.name}` : ""}: ${reason}`);
  console.log(`[ai] ${conversation.id}: transferida (${reason})`);
}

async function respond(conversationId: string, messageId: string) {
  const conversation = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.assigneeId || conversation.closedAt) return;
  // Chegou mensagem mais nova: a espera dela responde tudo de uma vez.
  const latest = await prisma.chatMessage.findFirst({ where: { conversationId, author: "customer" }, orderBy: { createdAt: "desc" }, select: { id: true, text: true } });
  if (latest?.id !== messageId) return;
  if (!(await firstDispatch(`ai:${messageId}`))) return;
  if (await handedOff(conversationId)) return;
  const settings = await readAiSettings();
  if (!settings.autonomousEnabled) return;

  // Mensagens do cliente desde a última resposta (bot ou atendente).
  const lastAnswer = await prisma.chatMessage.findFirst({ where: { conversationId, author: { in: ["bot", "agent"] }, internal: false }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const pending = await prisma.chatMessage.findMany({ where: { conversationId, author: "customer", ...(lastAnswer ? { createdAt: { gt: lastAnswer.createdAt } } : {}) }, select: { text: true } });
  const pendingText = pending.map((item) => item.text).join("\n");

  if (asksForHuman(settings, pendingText)) return handoff(conversation, settings, "Cliente pediu para falar com uma pessoa");
  const aiReplies = await prisma.chatMessage.count({ where: { conversationId, author: "bot", authorName: AI_AUTHOR } });
  if (aiReplies >= settings.maxAiReplies) return handoff(conversation, settings, `Limite de ${settings.maxAiReplies} respostas da IA atingido`);

  const [context, info, queues] = await Promise.all([
    conversationContext(conversation, { includeHistory: settings.useCustomerOrders }),
    knowledge(settings),
    settings.aiChoosesQueue && !settings.handoffQueueId ? prisma.chatQueue.findMany({ where: { archivedAt: null }, select: { name: true }, orderBy: { order: "asc" } }) : [],
  ]);

  let decision: AgentDecision;
  try {
    decision = await aiJson<AgentDecision>(
      [
        { role: "system", content: `${rules(settings, queues.map((queue) => queue.name))}\n\nAgora: ${formatBr(new Date(), { dateStyle: "full", timeStyle: "short" })} (Brasília).\n\nInformações que você pode usar:\n${info || "(nenhuma informação cadastrada: transfira dúvidas específicas)"}` },
        { role: "user", content: context.text },
      ],
      { feature: "agent", conversationId, maxTokens: 700 },
    );
  } catch (error) {
    // IA fora do ar: ninguém fica sem resposta, a conversa vai para a equipe.
    return handoff(conversation, settings, error instanceof AiError ? `IA indisponível (${error.message})` : "IA indisponível");
  }

  // Pode ter sido assumida enquanto a IA pensava.
  const fresh = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
  if (!fresh || fresh.assigneeId || fresh.closedAt) return;

  const reply = decision.reply?.trim() ?? "";
  const reason = decision.reason?.trim() || "Sem motivo informado";
  if (decision.action === "handoff") {
    if (reply && !settings.handoffMessage.trim()) await sendAutomaticMessage(fresh, reply, undefined, undefined, AI_AUTHOR);
    return handoff(fresh, settings, reason, decision.queue);
  }
  if (!reply) return handoff(fresh, settings, "A IA não soube responder");
  await sendAutomaticMessage(fresh, reply, undefined, undefined, AI_AUTHOR);
  if (decision.action === "resolved" && settings.closeWhenResolved) {
    // A resposta da IA já é a despedida: sem a mensagem padrão nem pesquisa.
    await closeConversation(fresh, null, `Atendimento resolvido pela IA: ${reason}`, "");
  }
}
