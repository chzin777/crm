import "server-only";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/cache";
import { formatBr } from "@/lib/br-time";
import { loadCustomerHistory } from "@/lib/chat/customer-history";
import { aiJson } from "@/lib/ai/openai";
import type { CustomerHistory } from "@/lib/chat/types";

const MESSAGES_LIMIT = 40;
const CATALOG_LIMIT = 60;
const CATALOG_DAYS = 180;

type ConversationRef = { id: string; contactId: string; phone: string; subject: string; queueId: string | null };

const AUTHOR_LABEL = { customer: "Cliente", agent: "Atendente", bot: "Robô", system: "Sistema" } as const;

const BRAND_RULES = [
  "Você trabalha na equipe de atendimento da Óticas Brasil, rede de óticas (óculos de grau, óculos de sol, lentes oftálmicas, lentes de contato, armações e exames de vista).",
  "Escreva sempre em português do Brasil, tom cordial, próximo e profissional, frases curtas, adequadas ao WhatsApp.",
  "Nunca invente preços, prazos, estoque, promoções, endereços ou políticas que não estejam no contexto. Se faltar informação, oriente a confirmar com a loja ou a pedir o dado ao cliente.",
  "Nunca peça dados sensíveis como senha ou número de cartão.",
].join("\n");

async function transcript(conversationId: string) {
  const rows = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: MESSAGES_LIMIT,
    select: { author: true, authorName: true, text: true, internal: true, attachment: true, createdAt: true },
  });
  return rows
    .reverse()
    .map((row) => {
      const attachment = row.attachment as { kind?: string; name?: string } | null;
      const body = row.text.trim() || (attachment ? `[${attachment.kind ?? "arquivo"}${attachment.name ? `: ${attachment.name}` : ""}]` : "");
      if (!body) return null;
      const who = row.author === "agent" && row.authorName ? `Atendente ${row.authorName.split(" ")[0]}` : AUTHOR_LABEL[row.author];
      return `[${formatBr(row.createdAt, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}] ${who}${row.internal ? " (nota interna, o cliente não vê)" : ""}: ${body}`;
    })
    .filter(Boolean)
    .join("\n");
}

function historyText(history: CustomerHistory | null) {
  if (!history) return "Sem cadastro no ERP.";
  const lines = [
    `Compras no ERP: ${history.purchases} · total gasto R$ ${history.totalSpent.toFixed(2)} · última compra: ${history.lastPurchaseDate ?? "nunca"}`,
    `Loja do cadastro: ${history.store ?? "não informada"}`,
    `Receita: última compra de lentes de grau ${history.prescription.lastLensPurchase ?? "sem registro"}${history.prescription.lensType ? ` (${history.prescription.lensType})` : ""}${history.prescription.renewalDue ? " · receita provavelmente vencida, oportunidade de novo exame/renovação" : ""}`,
  ];
  for (const order of history.orders.slice(0, 6)) lines.push(`Pedido ${order.orderNumber} em ${order.date ?? "?"} (${order.status}, R$ ${order.total.toFixed(2)}): ${order.summary || `${order.items} itens`}`);
  return lines.join("\n");
}

async function conversationContext(conversation: ConversationRef) {
  const [contact, queue, messages, history] = await Promise.all([
    prisma.contact.findUnique({ where: { id: conversation.contactId }, select: { name: true } }),
    conversation.queueId ? prisma.chatQueue.findUnique({ where: { id: conversation.queueId }, select: { name: true } }) : null,
    transcript(conversation.id),
    loadCustomerHistory(conversation),
  ]);
  return {
    contactName: contact?.name ?? "Cliente",
    text: [
      `Cliente: ${contact?.name ?? "não identificado"}`,
      `Fila: ${queue?.name ?? "sem fila"}${conversation.subject ? ` · Assunto: ${conversation.subject}` : ""}`,
      "",
      "Histórico do cliente no ERP:",
      historyText(history),
      "",
      "Conversa (mais antigas primeiro):",
      messages || "(sem mensagens)",
    ].join("\n"),
  };
}

/** Produtos mais vendidos da rede: referência real para as sugestões, sem inventar itens. */
function catalog() {
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

export async function suggestReply(conversation: ConversationRef, agentName: string): Promise<ReplySuggestion> {
  const context = await conversationContext(conversation);
  const result = await aiJson<{ reply?: string }>([
    {
      role: "system",
      content: `${BRAND_RULES}\nSua tarefa: escrever a PRÓXIMA mensagem do atendente ${agentName.split(" ")[0]} para o cliente, respondendo ao que ficou pendente na conversa. Use as notas internas apenas como contexto. Não se apresente de novo se a conversa já começou. Responda em JSON: {"reply": "texto da mensagem"}.`,
    },
    { role: "user", content: context.text },
  ], { maxTokens: 600 });
  const reply = result.reply?.trim();
  if (!reply) throw new Error("A IA não sugeriu nenhuma resposta.");
  return { reply };
}

export type ConversationSummary = { summary: string; customerNeed: string; nextSteps: string[]; sentiment: "positivo" | "neutro" | "negativo"; pending: boolean };

export async function summarizeConversation(conversation: ConversationRef): Promise<ConversationSummary> {
  const context = await conversationContext(conversation);
  const result = await aiJson<Partial<ConversationSummary>>([
    {
      role: "system",
      content: `${BRAND_RULES}\nSua tarefa: resumir o atendimento para outro membro da equipe que vai assumir a conversa. Seja objetivo. Responda em JSON: {"summary": "resumo em até 5 frases", "customerNeed": "o que o cliente quer, em uma frase", "nextSteps": ["próximo passo", "..."], "sentiment": "positivo" | "neutro" | "negativo", "pending": true se há algo pendente para a equipe responder}.`,
    },
    { role: "user", content: context.text },
  ], { maxTokens: 900 });
  return {
    summary: result.summary?.trim() || "Sem informações suficientes para resumir.",
    customerNeed: result.customerNeed?.trim() || "",
    nextSteps: Array.isArray(result.nextSteps) ? result.nextSteps.map(String).filter(Boolean).slice(0, 6) : [],
    sentiment: result.sentiment === "positivo" || result.sentiment === "negativo" ? result.sentiment : "neutro",
    pending: result.pending === true,
  };
}

export type ProductSuggestion = { product: string; reason: string; pitch: string };

export async function suggestProducts(conversation: ConversationRef): Promise<{ suggestions: ProductSuggestion[] }> {
  const [context, products] = await Promise.all([conversationContext(conversation), catalog()]);
  const result = await aiJson<{ suggestions?: Partial<ProductSuggestion>[] }>([
    {
      role: "system",
      content: `${BRAND_RULES}\nSua tarefa: sugerir até 3 oportunidades de venda para este cliente, com base no que ele comprou, no que pediu na conversa e na validade da receita. Escolha produtos do catálogo de mais vendidos abaixo ou categorias coerentes (ex.: renovação de lentes, óculos de sol, lentes de contato, segundo par). Não cite preço exato; diga "a partir de" só se usar o preço médio do catálogo. Responda em JSON: {"suggestions": [{"product": "produto ou categoria", "reason": "por que faz sentido para este cliente", "pitch": "mensagem curta de WhatsApp oferecendo"}]}.\n\nCatálogo (mais vendidos nos últimos ${CATALOG_DAYS} dias):\n${products || "(sem dados de vendas)"}`,
    },
    { role: "user", content: context.text },
  ], { maxTokens: 1000 });
  const suggestions = (result.suggestions ?? [])
    .map((item) => ({ product: String(item.product ?? "").trim(), reason: String(item.reason ?? "").trim(), pitch: String(item.pitch ?? "").trim() }))
    .filter((item) => item.product)
    .slice(0, 3);
  return { suggestions };
}
