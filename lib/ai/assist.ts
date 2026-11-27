import "server-only";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/cache";
import { formatContext, transcriptLine, type TranscriptRow } from "@/lib/ai/agent-core";
import { loadPromptModules } from "@/lib/ai/prompt-modules-db";
import { fillModule, wantsJson } from "@/lib/ai/prompt-modules";
import { knowledgePromptBlock } from "@/lib/ai/studio";
import { loadCustomerHistory } from "@/lib/chat/customer-history";
import { aiJson } from "@/lib/ai/openai";
import { conversationTemperature } from "@/lib/ai/temperature";
import { sessionRows } from "@/lib/ai/session-anchor";
import { readAiSettings } from "@/lib/ai/store";
import { loadStudioContext } from "@/lib/ai/studio-db";
import { buildCopilotPrompt } from "@/lib/ai/reply-copilot";
import { sanitizeAiResponse } from "@/lib/ai/sanitize";
import { classifyVague, vagueMessageBlock } from "@/lib/ai/vague-message";
import { campaignNames } from "@/lib/chat/campaign-origin";

const MESSAGES_LIMIT = 40;
const CATALOG_LIMIT = 60;
const CATALOG_DAYS = 180;

export type ConversationRef = { id: string; contactId: string; phone: string; subject: string; queueId: string | null };

/** Identidade da marca para tarefas internas (resumo, sugestões): o módulo "identidade" de /ia, se ativo. */
async function brandIdentity(agentName: string) {
  const identity = (await loadPromptModules()).find((module) => module.slug === "identidade" && module.isActive);
  return identity ? fillModule(identity.contentMarkdown, { nome_agente: agentName }) : "";
}

/**
 * Início do atendimento atual: cliente que volta depois do encerramento abre conversa nova; conversa reaberta
 * começa na reabertura. Mensagens anteriores (sessão encerrada) nunca vão para a IA. null = conversa inteira.
 */
export async function sessionStartedAt(conversationId: string): Promise<Date | null> {
  const reopen = await prisma.chatAudit.findFirst({ where: { targetId: conversationId, action: "conversation.reopen" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  return reopen?.createdAt ?? null;
}

const TRANSCRIPT_SELECT = { author: true, authorName: true, text: true, internal: true, attachment: true, createdAt: true } as const;
type TranscriptDbRow = { author: TranscriptRow["author"]; authorName: string | null; text: string; internal: boolean; attachment: unknown; createdAt: Date };
const lines = (rows: TranscriptDbRow[], now: Date) =>
  rows
    .map((row) => transcriptLine({ ...row, attachment: row.attachment as TranscriptRow["attachment"] }, now))
    .filter(Boolean)
    .join("\n");

/** Mínimo de mensagens que a IA lê: sessão curta é completada com o fim do atendimento anterior (até 7 dias). */
export const AI_CONTEXT_MESSAGES = 30;
const PREVIOUS_DAYS = 7;

async function transcript(conversationId: string, sessionOnly: boolean) {
  const since = sessionOnly ? await sessionStartedAt(conversationId) : null;
  const rows = await prisma.chatMessage.findMany({
    where: { conversationId, ...(since ? { createdAt: { gt: since } } : {}) },
    orderBy: { createdAt: "desc" },
    take: MESSAGES_LIMIT,
    select: TRANSCRIPT_SELECT,
  });
  const session = sessionRows(rows, since).reverse();
  return { text: lines(session, new Date()), count: session.length, startedAt: since ?? session[0]?.createdAt ?? new Date() };
}

/**
 * Fim do atendimento anterior do mesmo cliente (conversa encerrada ou antes da reabertura), para a IA entender
 * retomadas como "Achou?" no dia seguinte. Só mensagens visíveis ao cliente; nunca notas internas.
 */
export async function previousSessionText(contactId: string, before: Date, currentCount: number, now: Date = new Date()) {
  const take = AI_CONTEXT_MESSAGES - currentCount;
  if (take <= 0) return "";
  const rows = await prisma.chatMessage.findMany({
    where: { conversation: { contactId }, internal: false, createdAt: { lt: before, gte: new Date(before.getTime() - PREVIOUS_DAYS * 24 * 60 * 60 * 1000) } },
    orderBy: { createdAt: "desc" },
    take,
    select: TRANSCRIPT_SELECT,
  });
  return lines([...rows].reverse(), now);
}

/** Contexto do cliente (mesmo formato do teste da página /ia, ver formatContext). */
/** sessionOnly: só o atendimento atual (agente autônomo); resumo e sugestão para a equipe veem a conversa inteira. */
export async function conversationContext(conversation: ConversationRef, options: { includeHistory?: boolean; sessionOnly?: boolean } = {}) {
  const includeHistory = options.includeHistory ?? true;
  const [contact, queue, messages, history] = await Promise.all([
    prisma.contact.findUnique({ where: { id: conversation.contactId }, select: { name: true, city: true, store: true } }),
    conversation.queueId ? prisma.chatQueue.findUnique({ where: { id: conversation.queueId }, select: { name: true } }) : null,
    transcript(conversation.id, !!options.sessionOnly),
    includeHistory ? loadCustomerHistory(conversation) : null,
  ]);
  // Agente autônomo: sessão curta ganha o fim do atendimento anterior (resumo/sugestão já veem a conversa inteira).
  const previous = options.sessionOnly ? await previousSessionText(conversation.contactId, messages.startedAt, messages.count).catch(() => "") : "";
  return {
    contactName: contact?.name ?? "Cliente",
    text: formatContext({ contactName: contact?.name ?? null, queueName: queue?.name ?? null, subject: conversation.subject, includeHistory, history, conversation: messages.text, registered: { city: contact?.city, store: contact?.store }, previous }),
  };
}

/** Produtos mais vendidos da rede: referência real para as sugestões, sem inventar itens. */
export function catalog() {
  return cached(`ai:catalog:v1`, 6 * 60 * 60, async () => {
    const rows = await prisma.$queryRaw<{ categoria: string | null; subcategoria: string | null; marca: string | null; descricao: string; vendas: number; preco: number }[]>`
      SELECT "category" AS categoria, "subcategory" AS subcategoria, "brand" AS marca, btrim("description") AS descricao,
        COUNT(*)::int AS vendas, round(avg("amount" / NULLIF("quantity", 0)), 2)::float8 AS preco
      FROM "VmsetSale"
      WHERE "type" = 'Venda' AND "amount" > 0 AND "orderDate" >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - ${CATALOG_DAYS}::int
        AND NULLIF(btrim("description"), '') IS NOT NULL AND COALESCE("category", '') NOT ILIKE '%SERVI%'
      GROUP BY 1, 2, 3, 4
      ORDER BY vendas DESC
      LIMIT ${CATALOG_LIMIT}
    `;
    return rows
      .map((row) => `- ${row.descricao}${row.marca ? ` · ${row.marca}` : ""} · ${[row.categoria, row.subcategoria].filter(Boolean).join("/")} · preço médio R$ ${Number(row.preco ?? 0).toFixed(2)} · ${row.vendas} vendas`)
      .join("\n");
  });
}

export type ReplySuggestion = { reply: string };

/**
 * Copiloto do atendente (botão no composer do /chat): mesmas instruções comerciais, regras do Estúdio e tom de /ia,
 * com o atendimento autônomo ligado ou não. Só devolve o texto: nada sai para o WhatsApp.
 */
export async function suggestReply(conversation: ConversationRef & { campaignId?: string | null }, agentName: string, userId?: string): Promise<ReplySuggestion> {
  const [context, settings, contact, campaigns, lastCustomer] = await Promise.all([
    conversationContext(conversation),
    readAiSettings(),
    prisma.contact.findUnique({ where: { id: conversation.contactId }, select: { name: true, city: true, store: true, tier: true, rfvpSegment: true } }),
    conversation.campaignId ? campaignNames() : null,
    prisma.chatMessage.findMany({ where: { conversationId: conversation.id, author: "customer" }, orderBy: { createdAt: "desc" }, take: 4, select: { text: true } }),
  ]);
  const customerText = lastCustomer.map((row) => row.text).join("\n");
  // Base de conhecimento (lojas, horários, preços médios, documentos ligados) e regras/skills do Estúdio de IA.
  const { aiKnowledge } = await import("@/lib/ai/agent");
  const [knowledge, studio] = await Promise.all([
    aiKnowledge(settings).catch(() => ""),
    loadStudioContext(customerText, { userId, conversationId: conversation.id }).catch(() => undefined),
  ]);
  const system = buildCopilotPrompt({
    modules: await loadPromptModules(),
    text: lastCustomer[0]?.text ?? "",
    conversationText: customerText,
    settings,
    agentName,
    knowledge: [knowledge, knowledgePromptBlock(studio?.knowledge ?? [])].filter(Boolean).join("\n\n"),
    turnHint: vagueMessageBlock(classifyVague(lastCustomer[0]?.text ?? "")),
    customer: {
      name: contact?.name ?? null,
      city: contact?.city?.trim() || null,
      store: contact?.store?.trim() || null,
      tier: contact?.tier ?? null,
      rfvpSegment: contact?.rfvpSegment ?? null,
      campaign: conversation.campaignId ? campaigns?.get(conversation.campaignId) ?? null : null,
    },
  });
  const result = await aiJson<{ reply?: string }>([
    ...(system ? [{ role: "system" as const, content: system }] : []),
    { role: "user", content: context.text },
  ], { plainText: !wantsJson(system), maxTokens: 700, feature: "reply", conversationId: conversation.id, userId, settings, temperature: conversationTemperature(settings) });
  // Copiloto: o texto que vai para o composer já sai sem travessão/hífen como pontuação.
  const reply = sanitizeAiResponse(result.reply?.trim() ?? "");
  if (!reply) throw new Error("A IA não sugeriu nenhuma resposta.");
  return { reply };
}

export type ConversationSummary = { summary: string; customerNeed: string; nextSteps: string[]; sentiment: "positivo" | "neutro" | "negativo"; pending: boolean };

export async function summarizeConversation(conversation: ConversationRef, userId?: string): Promise<ConversationSummary> {
  const context = await conversationContext(conversation);
  const result = await aiJson<Partial<ConversationSummary>>([
    {
      role: "system",
      content: `${await brandIdentity((await readAiSettings()).agentName)}\nSua tarefa: resumir o atendimento para outro membro da equipe que vai assumir a conversa. Seja objetivo. Responda em JSON: {"summary": "resumo em até 5 frases", "customerNeed": "o que o cliente quer, em uma frase", "nextSteps": ["próximo passo", "..."], "sentiment": "positivo" | "neutro" | "negativo", "pending": true se há algo pendente para a equipe responder}.`,
    },
    { role: "user", content: context.text },
  ], { maxTokens: 900, feature: "summary", conversationId: conversation.id, userId });
  return {
    summary: result.summary?.trim() || "Sem informações suficientes para resumir.",
    customerNeed: result.customerNeed?.trim() || "",
    nextSteps: Array.isArray(result.nextSteps) ? result.nextSteps.map(String).filter(Boolean).slice(0, 6) : [],
    sentiment: result.sentiment === "positivo" || result.sentiment === "negativo" ? result.sentiment : "neutro",
    pending: result.pending === true,
  };
}

export type ProductSuggestion = { product: string; reason: string; pitch: string };

export async function suggestProducts(conversation: ConversationRef, userId?: string): Promise<{ suggestions: ProductSuggestion[] }> {
  const [context, products] = await Promise.all([conversationContext(conversation), catalog()]);
  const result = await aiJson<{ suggestions?: Partial<ProductSuggestion>[] }>([
    {
      role: "system",
      content: `${await brandIdentity((await readAiSettings()).agentName)}\nSua tarefa: sugerir até 3 oportunidades de venda para este cliente, com base no que ele comprou, no que pediu na conversa e na validade da receita. Escolha produtos do catálogo de mais vendidos abaixo ou categorias coerentes (ex.: renovação de lentes, óculos de sol, lentes de contato, segundo par). Não cite preço exato; diga "a partir de" só se usar o preço médio do catálogo. Responda em JSON: {"suggestions": [{"product": "produto ou categoria", "reason": "por que faz sentido para este cliente", "pitch": "mensagem curta de WhatsApp oferecendo"}]}.\n\nCatálogo (mais vendidos nos últimos ${CATALOG_DAYS} dias):\n${products || "(sem dados de vendas)"}`,
    },
    { role: "user", content: context.text },
  ], { maxTokens: 1000, feature: "products", conversationId: conversation.id, userId });
  const suggestions = (result.suggestions ?? [])
    .map((item) => ({ product: String(item.product ?? "").trim(), reason: String(item.reason ?? "").trim(), pitch: String(item.pitch ?? "").trim() }))
    .filter((item) => item.product)
    .slice(0, 3);
  return { suggestions };
}
