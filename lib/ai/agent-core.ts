import { formatBr } from "@/lib/br-time";
import { fillVariables } from "@/lib/chat/text";
import { AI_TONES, asksForHuman, type AiSettings } from "@/lib/ai/settings";
import { IMAGE_RULE } from "@/lib/ai/catalog-search";
import { STOCK_RULES } from "@/lib/ai/stock";
import { MESSAGE_TEXT_LIMIT, SECURITY_REMINDER, SECURITY_RULES, limitText, wrapUntrusted } from "@/lib/ai/guard";
import type { CustomerHistory } from "@/lib/chat/types";

/**
 * Regras do agente de IA sem banco nem rede: as mesmas para o atendimento real (WhatsApp) e para o teste
 * da página /ia. A chamada ao modelo fica em runAiAgent (lib/ai/agent), que usa estas funções nos dois caminhos.
 */

export type AgentDecision = { reply?: string; action?: "reply" | "handoff" | "resolved"; reason?: string; queue?: string };

/** O que disparou o resultado: regra antes da IA (keyword, media, limit) ou a própria IA. */
/** catalog_miss: foto de produto sem resultado no catálogo; prescription: receita/documento em foto (conferência humana). */
export type AgentTrigger = "keyword" | "media" | "limit" | "ai" | "no_reply" | "catalog_miss" | "prescription" | "security";
export type AgentOutcome = { action: "reply" | "handoff" | "resolved"; reply: string; reason: string; queue: string; trigger: AgentTrigger };

const AUTHOR_LABEL = { customer: "Cliente", agent: "Atendente", bot: "Robô", system: "Sistema" } as const;
export type TranscriptRow = { author: keyof typeof AUTHOR_LABEL; authorName: string | null; text: string; internal: boolean; attachment: { kind?: string; name?: string } | null; createdAt: Date };

/** Uma linha da conversa como a IA lê (mesmo formato no WhatsApp e no teste). */
export function transcriptLine(row: TranscriptRow) {
  const body = limitText(row.text.trim(), MESSAGE_TEXT_LIMIT) || (row.attachment ? `[${row.attachment.kind ?? "arquivo"}${row.attachment.name ? `: ${row.attachment.name}` : ""}]` : "");
  if (!body) return null;
  const who = row.author === "agent" && row.authorName ? `Atendente ${row.authorName.split(" ")[0]}` : AUTHOR_LABEL[row.author];
  return `[${formatBr(row.createdAt, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}] ${who}${row.internal ? " (nota interna, o cliente não vê)" : ""}: ${body}`;
}

export function historyText(history: CustomerHistory | null) {
  if (!history) return "Sem cadastro no ERP.";
  const lines = [
    `Compras no ERP: ${history.purchases} · total gasto R$ ${history.totalSpent.toFixed(2)} · última compra: ${history.lastPurchaseDate ?? "nunca"}`,
    `Loja do cadastro: ${history.store ?? "não informada"}`,
    `Receita: última compra de lentes de grau ${history.prescription.lastLensPurchase ?? "sem registro"}${history.prescription.lensType ? ` (${history.prescription.lensType})` : ""}${history.prescription.renewalDue ? " · receita provavelmente vencida, oportunidade de novo exame/renovação" : ""}`,
  ];
  for (const order of history.orders.slice(0, 6)) lines.push(`Pedido ${order.orderNumber} em ${order.date ?? "?"} (${order.status}, R$ ${order.total.toFixed(2)}): ${order.summary || `${order.items} itens`}`);
  return lines.join("\n");
}

/** Contexto do cliente enviado à IA: cadastro, fila, histórico do ERP (se permitido) e a conversa. */
export function formatContext(input: { contactName: string | null; queueName: string | null; subject: string; includeHistory: boolean; history: CustomerHistory | null; conversation: string }) {
  return [
    // O nome do contato é escolhido pelo cliente no WhatsApp: também é dado não confiável.
    `Cliente: ${input.contactName ? wrapUntrusted(input.contactName, "nome do contato", 80) : "não identificado"}`,
    `Fila: ${input.queueName ?? "sem fila"}${input.subject ? ` · Assunto: ${input.subject}` : ""}`,
    "",
    "Histórico do cliente no ERP:",
    input.includeHistory ? historyText(input.history) : "(não disponível para a IA)",
    "",
    "Conversa (mais antigas primeiro):",
    input.conversation ? wrapUntrusted(input.conversation, "conversa") : "(sem mensagens)",
  ].join("\n");
}

/**
 * Regras que decidem antes de chamar a IA (mesma ordem do atendimento real): pedido de pessoa,
 * gatilho de mídia e limite de respostas da IA. null = a IA responde.
 */
export function preAgentOutcome(settings: AiSettings, input: { pendingText: string; hasMedia: boolean; aiReplies: number; ignoreMediaTrigger?: boolean }): AgentOutcome | null {
  const handoff = (reason: string, trigger: AgentTrigger): AgentOutcome => ({ action: "handoff", reply: "", reason, queue: "", trigger });
  if (asksForHuman(settings, input.pendingText)) return handoff("Cliente pediu para falar com uma pessoa", "keyword");
  if (settings.handoffOnMedia && input.hasMedia && !input.ignoreMediaTrigger) return handoff("Cliente enviou documento ou áudio", "media");
  if (input.aiReplies >= settings.maxAiReplies) return handoff(`Limite de ${settings.maxAiReplies} respostas da IA atingido`, "limit");
  return null;
}

/** Resposta do modelo virando ação: transferência, resolução ou resposta; resposta vazia vai para a equipe. */
export function interpretDecision(decision: AgentDecision): AgentOutcome {
  const reply = decision.reply?.trim() ?? "";
  const reason = decision.reason?.trim() || "Sem motivo informado";
  const queue = decision.queue?.trim() ?? "";
  if (decision.action === "handoff") return { action: "handoff", reply, reason, queue, trigger: "ai" };
  if (!reply) return { action: "handoff", reply: "", reason: "A IA não soube responder", queue: "", trigger: "no_reply" };
  return { action: decision.action === "resolved" ? "resolved" : "reply", reply, reason, queue, trigger: "ai" };
}

/**
 * Mensagens que o cliente receberia (janela de 24h aberta): na transferência pela IA, a resposta dela só sai
 * quando não há mensagem de transferência configurada; a mensagem de transferência sai preenchida.
 */
export function customerMessages(outcome: AgentOutcome, settings: Pick<AiSettings, "handoffMessage">, vars: { customer?: string | null; queue?: string | null }, now = new Date()) {
  if (outcome.action !== "handoff") return outcome.reply ? [outcome.reply] : [];
  // Foto sem resultado no catálogo ou receita: a resposta já avisa o encaminhamento (sem repetir a de transferência).
  if (outcome.trigger === "catalog_miss" || outcome.trigger === "prescription") return outcome.reply ? [outcome.reply] : [];
  const messages: string[] = [];
  if (outcome.trigger === "ai" && outcome.reply && !settings.handoffMessage.trim()) messages.push(outcome.reply);
  if (settings.handoffMessage.trim()) messages.push(fillVariables(settings.handoffMessage, { customer: vars.customer ?? undefined, queue: vars.queue ?? undefined }, now));
  return messages;
}

/** Perfis de cliente fictício do teste da página /ia. */
export type SimulatedProfileId = "novo" | "recorrente";
export const SIMULATED_PROFILES: { id: SimulatedProfileId; label: string; name: string; hint: string }[] = [
  { id: "novo", label: "Cliente novo (sem histórico)", name: "Cliente Teste", hint: "Sem cadastro no ERP, como um número que escreve pela primeira vez." },
  { id: "recorrente", label: "Cliente recorrente (com pedido no ERP)", name: "Maria Teste", hint: "3 compras, último pedido de lentes multifocais há 14 meses (receita provavelmente vencida)." },
];

export function simulatedHistory(profile: SimulatedProfileId, now = new Date()): CustomerHistory | null {
  if (profile !== "recorrente") return null;
  const ago = (months: number) => {
    const date = new Date(now);
    date.setMonth(date.getMonth() - months);
    return date.toISOString().slice(0, 10);
  };
  return {
    cpf: null,
    store: "Loja Centro",
    purchases: 3,
    totalSpent: 2389.7,
    lastPurchaseDate: ago(14),
    prescription: { lastLensPurchase: ago(14), lensType: "multifocal", expiry: null, renewalDue: true },
    orders: [
      { orderNumber: "T-10482", date: ago(14), total: 1489.9, store: "Loja Centro", status: "Entregue", invoice: null, items: 2, summary: "Armação acetato preta + lentes multifocais antirreflexo" },
      { orderNumber: "T-09311", date: ago(26), total: 599.9, store: "Loja Centro", status: "Entregue", invoice: null, items: 1, summary: "Óculos de sol polarizado" },
      { orderNumber: "T-08120", date: ago(38), total: 299.9, store: "Loja Centro", status: "Entregue", invoice: null, items: 1, summary: "Lentes de contato mensais (caixa com 6)" },
    ],
    campaigns: [],
  };
}

export const BRAND_RULES = [
  "Você trabalha na equipe de atendimento da Óticas Brasil, rede de óticas (óculos de grau, óculos de sol, lentes oftálmicas, lentes de contato, armações e exames de vista).",
  "Escreva sempre em português do Brasil, tom cordial, próximo e profissional, frases curtas, adequadas ao WhatsApp.",
  "Nunca invente preços, prazos, estoque, promoções, endereços ou políticas que não estejam no contexto. Estoque só pela ferramenta consultarEstoqueProduto. Se faltar outra informação, oriente a pedir o dado ao cliente ou transfira.",
  "Nunca peça dados sensíveis como senha ou número de cartão.",
].join("\n");

/** Regras do agente (WhatsApp e teste da página /ia). A regra de imagens é fixa no código, logo após as da marca. */
export function agentRules(settings: AiSettings, queueNames: string[]) {
  const handoff = [
    "Transfira para uma pessoa (action \"handoff\") quando:",
    "- o cliente pedir para falar com uma pessoa;",
    settings.handoffOnComplaint ? "- o cliente reclamar, estiver irritado ou relatar problema com pedido, produto ou atendimento;" : "",
    settings.handoffOnPurchaseIntent ? "- o cliente quiser fechar uma compra, fazer orçamento com receita ou negociar condições;" : "",
    settings.handoffWhenUnsure ? "- a resposta não estiver nas informações abaixo ou você não tiver certeza;" : "",
  ].filter(Boolean);
  return [
    // Fixas no código, antes e depois das instruções da tela: segurança, marca e imagens.
    SECURITY_RULES,
    BRAND_RULES,
    IMAGE_RULE,
    STOCK_RULES,
    `Você é ${settings.agentName}, assistente virtual que atende clientes pelo WhatsApp. Se for a primeira resposta da conversa, apresente-se brevemente como assistente virtual.`,
    `Tom de voz: ${(AI_TONES.find((tone) => tone.id === settings.tone) ?? AI_TONES[0]).instruction}`,
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

/**
 * Prompt de sistema completo (WhatsApp e teste): regras fixas de segurança no início, instruções da tela no meio,
 * blocos extras do sistema (anexos, resultado do catálogo, alerta de manipulação), informações e o lembrete de
 * segurança por último. Nada vindo do cliente entra aqui: os dados dele vão só na mensagem "user", delimitados.
 */
export function buildSystemPrompt(input: { settings: AiSettings; queueNames: string[]; info: string; extra?: string[]; now?: Date }) {
  return [
    agentRules(input.settings, input.queueNames),
    ...(input.extra ?? []).filter(Boolean),
    `Agora: ${formatBr(input.now ?? new Date(), { dateStyle: "full", timeStyle: "short" })} (Brasília).`,
    `Informações que você pode usar:\n${input.info || "(nenhuma informação cadastrada: transfira dúvidas específicas)"}`,
    SECURITY_REMINDER,
  ].join("\n\n");
}
