import "server-only";
import { prisma } from "@/lib/prisma";
import { aiConfigured, aiJson } from "@/lib/ai/openai";
import { anonymize, contentHash } from "@/lib/ai/vector-memory";
import { deleteVectors, upsertVectors } from "@/lib/ai/vector-memory-db";

const MAX_MESSAGES = 60;

type Extracted = { situacao?: string; pedido?: string; conducao?: string[]; trechos?: { cliente?: string; atendente?: string }[] };
export type GoldReason = "padrao_ouro" | "venda";

/**
 * Atendimento bem-sucedido vira exemplo (few-shot dinâmico): a IA resume a situação e a condução vencedora em pares
 * cliente → atendente, sem dados pessoais (nomes, telefone, CPF, e-mail e números longos saem antes e depois).
 */
export async function saveGoldConversation(conversationId: string, options: { reason: GoldReason; userId?: string | null }): Promise<boolean> {
  if (!aiConfigured()) return false;
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { id: true, contact: { select: { name: true, city: true, store: true } }, queue: { select: { name: true } } },
  });
  if (!conversation) return false;
  const rows = await prisma.chatMessage.findMany({
    where: { conversationId, internal: false, author: { in: ["customer", "agent", "bot"] }, NOT: { text: "" } },
    orderBy: { createdAt: "desc" },
    take: MAX_MESSAGES,
    select: { author: true, authorName: true, text: true },
  });
  const messages = rows.reverse();
  if (!messages.some((row) => row.author === "customer") || !messages.some((row) => row.author !== "customer")) return false;
  const names = [conversation.contact?.name, ...messages.map((row) => (row.author === "customer" ? null : row.authorName?.replace(/^Campanha · /, "")))];
  const transcript = messages.map((row) => `${row.author === "customer" ? "Cliente" : row.authorName?.startsWith("Campanha · ") ? "Loja (campanha)" : "Atendente"}: ${anonymize(row.text, names).slice(0, 600)}`).join("\n");

  const result = await aiJson<Extracted>([
    {
      role: "system",
      content: [
        "Você analisa um atendimento de WhatsApp de uma ótica que terminou bem (venda ou atendimento exemplar) para ensinar a equipe e a IA.",
        "Devolva JSON: {\"situacao\": \"contexto em 1 frase (como o cliente chegou e o que queria)\", \"pedido\": \"o pedido principal do cliente com as palavras dele\", \"conducao\": [\"até 4 decisões da atendente que fizeram dar certo\"], \"trechos\": [{\"cliente\": \"...\", \"atendente\": \"...\"}] (até 4 pares reais e decisivos, resumidos)}.",
        "Nunca inclua nomes, telefones, CPF, endereço, e-mail, número de pedido nem valores exatos de parcelas. Escreva em português do Brasil.",
      ].join("\n"),
    },
    { role: "user", content: transcript.slice(-12000) },
  ], { feature: "gold_example", conversationId, userId: options.userId ?? null, maxTokens: 700 });

  const pairs = (result.trechos ?? []).filter((pair) => pair.cliente && pair.atendente).slice(0, 4);
  const clean = (text: string | undefined) => anonymize(String(text ?? "").trim(), names);
  const content = [
    result.situacao ? `Situação: ${clean(result.situacao)}` : "",
    result.pedido ? `Pedido do cliente: ${clean(result.pedido)}` : "",
    result.conducao?.length ? `O que funcionou: ${result.conducao.slice(0, 4).map(clean).join("; ")}` : "",
    ...pairs.map((pair) => `Cliente: ${clean(pair.cliente)}\nAtendente: ${clean(pair.atendente)}`),
  ].filter(Boolean).join("\n");
  if (!content.trim()) return false;
  await upsertVectors([{
    sourceType: "CLOSED_CONVERSATION",
    sourceId: conversationId,
    title: clean(result.situacao).slice(0, 200) || "Atendimento padrão ouro",
    content,
    metadata: { reason: options.reason, queue: conversation.queue?.name ?? null, city: conversation.contact?.city ?? null, store: conversation.contact?.store ?? null, savedBy: options.userId ?? null, savedAt: new Date().toISOString() },
  }], { feature: "gold_example", userId: options.userId ?? null, conversationId });
  return true;
}

export const isGoldConversation = async (conversationId: string) =>
  (await prisma.aiKnowledgeVector.count({ where: { sourceType: "CLOSED_CONVERSATION", sourceId: conversationId } })) > 0;

export const removeGoldConversation = (conversationId: string) => deleteVectors("CLOSED_CONVERSATION", { sourceId: conversationId });

/**
 * Ao encerrar: conversa que terminou em venda (compra faturada no VMSet desde o início da conversa) vira exemplo
 * automaticamente. Roda em segundo plano e nunca atrapalha o encerramento.
 */
export async function learnFromClosedConversation(conversationId: string, userId?: string | null) {
  try {
    if (!aiConfigured()) return;
    const conversation = await prisma.chatConversation.findUnique({ where: { id: conversationId }, select: { createdAt: true, contact: { select: { sourceKey: true } } } });
    const sourceKey = conversation?.contact?.sourceKey;
    if (!conversation || !sourceKey) return;
    const sales = await prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM "VmsetSale"
      WHERE "type" = 'Venda' AND "amount" > 0 AND "sourceKey" = ${sourceKey} AND "orderDate" >= ${conversation.createdAt}::date
    `;
    if ((sales[0]?.total ?? 0) > 0) await saveGoldConversation(conversationId, { reason: "venda", userId });
  } catch (error) {
    console.warn("[ai][memoria] atendimento encerrado não aprendido:", error instanceof Error ? error.message : error);
  }
}

/** Correção do copiloto: o que a IA sugeriu x o que o atendente realmente enviou, ligado à última mensagem do cliente. */
export async function saveCopilotCorrection(input: { conversationId: string; suggestion: string; sent: string; userId?: string | null }) {
  const [contact, lastCustomer] = await Promise.all([
    prisma.chatConversation.findUnique({ where: { id: input.conversationId }, select: { contact: { select: { name: true } } } }),
    prisma.chatMessage.findFirst({ where: { conversationId: input.conversationId, author: "customer", internal: false }, orderBy: { createdAt: "desc" }, select: { text: true } }),
  ]);
  const names = [contact?.contact?.name];
  const customer = anonymize(lastCustomer?.text ?? "", names).slice(0, 500);
  const sent = anonymize(input.sent, names).slice(0, 1200);
  const content = [
    customer ? `Cliente: ${customer}` : "",
    `Sugestão da IA (ajustada pela equipe): ${anonymize(input.suggestion, names).slice(0, 800)}`,
    `Como a atendente enviou: ${sent}`,
  ].filter(Boolean).join("\n");
  await upsertVectors([{
    sourceType: "COPILOT_CORRECTION",
    sourceId: `${input.conversationId}:${contentHash(sent).slice(0, 12)}`,
    title: "Correção do copiloto",
    content,
    metadata: { conversationId: input.conversationId, userId: input.userId ?? null, savedAt: new Date().toISOString() },
  }], { feature: "copilot_feedback", userId: input.userId ?? null, conversationId: input.conversationId });
}
