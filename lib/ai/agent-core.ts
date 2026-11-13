import { formatBr } from "@/lib/br-time";
import { fillVariables } from "@/lib/chat/text";
import { asksForHuman, type AiSettings } from "@/lib/ai/settings";
import type { CustomerHistory } from "@/lib/chat/types";

/**
 * Regras do agente de IA sem banco nem rede: as mesmas para o atendimento real (WhatsApp) e para o teste
 * da página /ia. A chamada ao modelo fica em runAiAgent (lib/ai/agent), que usa estas funções nos dois caminhos.
 */

export type AgentDecision = { reply?: string; action?: "reply" | "handoff" | "resolved"; reason?: string; queue?: string };

/** O que disparou o resultado: regra antes da IA (keyword, media, limit) ou a própria IA. */
export type AgentTrigger = "keyword" | "media" | "limit" | "ai" | "no_reply";
export type AgentOutcome = { action: "reply" | "handoff" | "resolved"; reply: string; reason: string; queue: string; trigger: AgentTrigger };

const AUTHOR_LABEL = { customer: "Cliente", agent: "Atendente", bot: "Robô", system: "Sistema" } as const;
export type TranscriptRow = { author: keyof typeof AUTHOR_LABEL; authorName: string | null; text: string; internal: boolean; attachment: { kind?: string; name?: string } | null; createdAt: Date };

/** Uma linha da conversa como a IA lê (mesmo formato no WhatsApp e no teste). */
export function transcriptLine(row: TranscriptRow) {
  const body = row.text.trim() || (row.attachment ? `[${row.attachment.kind ?? "arquivo"}${row.attachment.name ? `: ${row.attachment.name}` : ""}]` : "");
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
    `Cliente: ${input.contactName ?? "não identificado"}`,
    `Fila: ${input.queueName ?? "sem fila"}${input.subject ? ` · Assunto: ${input.subject}` : ""}`,
    "",
    "Histórico do cliente no ERP:",
    input.includeHistory ? historyText(input.history) : "(não disponível para a IA)",
    "",
    "Conversa (mais antigas primeiro):",
    input.conversation || "(sem mensagens)",
  ].join("\n");
}

/**
 * Regras que decidem antes de chamar a IA (mesma ordem do atendimento real): pedido de pessoa,
 * gatilho de mídia e limite de respostas da IA. null = a IA responde.
 */
export function preAgentOutcome(settings: AiSettings, input: { pendingText: string; hasMedia: boolean; aiReplies: number; ignoreMediaTrigger?: boolean }): AgentOutcome | null {
  const handoff = (reason: string, trigger: AgentTrigger): AgentOutcome => ({ action: "handoff", reply: "", reason, queue: "", trigger });
  if (asksForHuman(settings, input.pendingText)) return handoff("Cliente pediu para falar com uma pessoa", "keyword");
  if (settings.handoffOnMedia && input.hasMedia && !input.ignoreMediaTrigger) return handoff("Cliente enviou foto, documento ou áudio (ex.: receita)", "media");
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
