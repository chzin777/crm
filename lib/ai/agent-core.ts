import { formatBr } from "@/lib/br-time";
import { promptConditions, skillConditions, type PromptState } from "@/lib/ai/prompt-composer";
import { assemblePrompt, type AssembledPrompt, type PromptModule } from "@/lib/ai/prompt-modules";
import type { AiSkill } from "@/lib/ai/studio";
import { fillVariables } from "@/lib/chat/text";
import { asksForHuman, type AiSettings } from "@/lib/ai/settings";
import { contactFirstName, defaultHandoffNotice } from "@/lib/ai/staff-request";
import { joinBubbles, splitBubbles } from "@/lib/ai/bubbles";
import { NO_REPLY_TOKEN, silentClosing } from "@/lib/ai/closing";
import { humanRequestMode, queueRoutingData, type RoutingQueue } from "@/lib/ai/routing";
import { MESSAGE_TEXT_LIMIT, limitText, wrapUntrusted } from "@/lib/ai/guard";
import type { CustomerHistory } from "@/lib/chat/types";

/**
 * Regras do agente de IA sem banco nem rede: as mesmas para o atendimento real (WhatsApp) e para o teste
 * da página /ia. A chamada ao modelo fica em runAiAgent (lib/ai/agent), que usa estas funções nos dois caminhos.
 */

export type AgentDecision = { reply?: string; action?: "reply" | "handoff" | "resolved" | "no_reply"; reason?: string; queue?: string; queue_id?: string };

/** O que disparou o resultado: regra antes da IA (keyword, media, limit) ou a própria IA. */
/** catalog_miss: foto de produto sem resultado no catálogo; prescription: receita/documento em foto (conferência humana). */
/** closing: a IA já se despediu e o cliente só mandou mais um fechamento de cortesia (silêncio, sem transferir). */
export type AgentTrigger = "keyword" | "media" | "limit" | "ai" | "no_reply" | "catalog_miss" | "prescription" | "security" | "closing" | "staff";
/** no_reply: encerramento silencioso, nada é enviado ao cliente. */
export type AgentOutcome = { action: "reply" | "handoff" | "resolved" | "no_reply"; reply: string; reason: string; queue: string; trigger: AgentTrigger; /** Pedido de pessoa pelo nome: colaborador do CRM e a fila dele. */ assigneeId?: string; assigneeName?: string; staffQueueId?: string };

const AUTHOR_LABEL = { customer: "Cliente", agent: "Atendente", bot: "Robô", system: "Sistema" } as const;
export type TranscriptRow = { author: keyof typeof AUTHOR_LABEL; authorName: string | null; text: string; internal: boolean; attachment: { kind?: string; name?: string } | null; createdAt: Date };

/** Uma linha da conversa como a IA lê (mesmo formato no WhatsApp e no teste). */
/**
 * Quem falou, do jeito que a IA precisa ler o fio: disparo de campanha é "Loja (mensagem da campanha ...)", não uma
 * atendente chamada "Campanha"; mensagens automáticas e de atendentes ficam identificadas.
 */
export function speakerLabel(row: Pick<TranscriptRow, "author" | "authorName">) {
  const name = row.authorName?.trim() ?? "";
  const campaign = name.match(/^Campanha\s*[·:-]\s*(.+)$/i);
  if (campaign) return `Loja (mensagem da campanha "${campaign[1].trim()}" enviada ao cliente)`;
  if (row.author === "agent" && name) return `Atendente ${name.split(" ")[0]}`;
  if (row.author === "bot" && name && name !== "Assistente IA") return `Loja (${name.toLowerCase()})`;
  return AUTHOR_LABEL[row.author];
}

export function transcriptLine(row: TranscriptRow) {
  const body = limitText(row.text.trim(), MESSAGE_TEXT_LIMIT) || (row.attachment ? `[${row.attachment.kind ?? "arquivo"}${row.attachment.name ? `: ${row.attachment.name}` : ""}]` : "");
  if (!body) return null;
  const who = speakerLabel(row);
  return `[${formatBr(row.createdAt, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}] ${who}${row.internal ? " (nota interna, o cliente não vê)" : ""}: ${body}`;
}

export function historyText(history: CustomerHistory | null) {
  if (!history) return "Sem cadastro no ERP.";
  const lines = [
    `Compras no ERP: ${history.purchases} · total gasto R$ ${history.totalSpent.toFixed(2)} · última compra: ${history.lastPurchaseDate ?? "nunca"}`,
    `Loja do cadastro: ${history.store ?? "não informada"}`,
    `Receita: última compra de lentes de grau ${history.prescription.lastLensPurchase ?? "sem registro"}${history.prescription.lensType ? ` (${history.prescription.lensType})` : ""}${history.prescription.renewalDue ? " · receita provavelmente vencida, sugerir renovar com o oftalmologista (não fazemos exame)" : ""}`,
  ];
  for (const order of history.orders.slice(0, 6)) lines.push(`Pedido ${order.orderNumber} em ${order.date ?? "?"} (${order.status}, R$ ${order.total.toFixed(2)}): ${order.summary || `${order.items} itens`}`);
  return lines.join("\n");
}

/** Contexto do cliente enviado à IA: cadastro, fila, histórico do ERP (se permitido) e a conversa. */
/**
 * Primeiro nome confiável para a saudação: vazio quando o cadastro é o telefone, emoji/símbolos, nome genérico
 * ou apelido curto (ex.: "Ju", "Lu"), para a IA saudar sem nome em vez de inventar.
 */
export function greetingName(contactName: string | null | undefined) {
  const name = (contactName ?? "").trim();
  if (!name || /^[\d\s()+.-]+$/.test(name)) return "";
  const first = contactFirstName(name);
  return first.length >= 3 ? first : "";
}

export function formatContext(input: { contactName: string | null; queueName: string | null; subject: string; includeHistory: boolean; history: CustomerHistory | null; conversation: string; /** Cidade e loja do cadastro (não pergunte de novo). */ registered?: { city?: string | null; store?: string | null } }) {
  const registered = [input.registered?.city?.trim() && `cidade ${input.registered.city.trim()}`, input.registered?.store?.trim() && `loja ${input.registered.store.trim()}`].filter(Boolean).join(" · ");
  return [
    // O nome do contato é escolhido pelo cliente no WhatsApp: também é dado não confiável.
    `Cliente: ${input.contactName ? wrapUntrusted(input.contactName, "nome do contato", 80) : "não identificado"}`,
    `Primeiro nome para a saudação: ${greetingName(input.contactName) || "(sem nome válido: saúde sem nome)"}`,
    ...(registered ? [`Cadastro: ${registered} (já sabido: não pergunte de novo, no máximo confirme)`] : []),
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
export function preAgentOutcome(settings: AiSettings, input: { pendingText: string; hasMedia: boolean; aiReplies: number; ignoreMediaTrigger?: boolean; queued?: QueuedState | null; lastAiText?: string | null }): AgentOutcome | null {
  const handoff = (reason: string, trigger: AgentTrigger): AgentOutcome => ({ action: "handoff", reply: "", reason, queue: "", trigger });
  // A IA já se despediu e o cliente só agradeceu de novo: silêncio (nem resposta, nem transferência, nem limite).
  if (silentClosing({ pendingText: input.pendingText, lastAiText: input.lastAiText, hasMedia: input.hasMedia })) return { action: "no_reply", reply: "", reason: "Cliente encerrou com cortesia depois da despedida", queue: "", trigger: "closing" };
  // Pedido de pessoa: com a IA escolhendo a fila, ela faz a triagem ou roteia (runAiAgent); sem isso, transfere direto.
  // Já na fila (espera assistida): pedir atendente não transfere de novo; a IA tranquiliza o cliente.
  if (!input.queued && humanRequestMode(settings, { pendingText: input.pendingText, aiReplies: input.aiReplies, asked: asksForHuman(settings, input.pendingText) }) === "direct") return handoff("Cliente pediu para falar com uma pessoa", "keyword");
  // Mídia nunca transfere às cegas: áudio é transcrito, documento e foto são lidos antes (receita/comprovante
  // transferem depois da leitura, com o resumo para o atendente; ver runAiAgent).
  if (input.aiReplies >= settings.maxAiReplies) return handoff(`Limite de ${settings.maxAiReplies} respostas da IA atingido`, "limit");
  return null;
}

/** Resposta do modelo virando ação: transferência, resolução ou resposta; resposta vazia vai para a equipe. */
export function interpretDecision(decision: AgentDecision): AgentOutcome {
  const reply = decision.reply?.trim() ?? "";
  const reason = decision.reason?.trim() || "Sem motivo informado";
  const queue = (typeof decision.queue_id === "string" && decision.queue_id.trim()) || (typeof decision.queue === "string" ? decision.queue.trim() : "");
  if (decision.action === "handoff") return { action: "handoff", reply, reason, queue, trigger: "ai" };
  // Encerramento silencioso pedido pelo modelo (action "no_reply" ou o token interno): nada sai para o cliente.
  if (decision.action === "no_reply" || reply.includes(NO_REPLY_TOKEN)) return { action: "no_reply", reply: "", reason: decision.reason?.trim() || "Encerramento silencioso", queue: "", trigger: "ai" };
  if (!joinBubbles(reply)) return { action: "handoff", reply: "", reason: "A IA não soube responder", queue: "", trigger: "no_reply" };
  return { action: decision.action === "resolved" ? "resolved" : "reply", reply, reason, queue, trigger: "ai" };
}

/**
 * Foto do produto e localização acompanham a resposta ao cliente. Na fila (espera assistida) a resposta sai mesmo
 * que o modelo marque transferência (não transfere de novo), então foto e mapa vão junto, igual fora da fila.
 */
export function carriesProductExtras(outcome: Pick<AgentOutcome, "action" | "reply">, queued: boolean) {
  return (outcome.action === "reply" || outcome.action === "resolved" || (queued && outcome.action === "handoff")) && !!outcome.reply;
}

/**
 * Mensagens que o cliente receberia (janela de 24h aberta): na transferência pela IA, a resposta dela só sai
 * quando não há mensagem de transferência configurada; a mensagem de transferência sai preenchida.
 */
export function customerMessages(outcome: AgentOutcome, settings: Pick<AiSettings, "handoffMessage">, vars: { customer?: string | null; queue?: string | null }, now = new Date()) {
  // Cada parte separada por ---SPLIT--- é uma bolha (mensagem) própria, como o cliente vê no WhatsApp.
  if (outcome.action === "no_reply") return [];
  if (outcome.action !== "handoff") return splitBubbles(outcome.reply);
  // Foto sem resultado no catálogo ou receita: a resposta já avisa o encaminhamento (sem repetir a de transferência).
  // Pedido de pessoa pelo nome: só a confirmação ("Claro, Vivi! Vou te transferir... com o Leandro").
  if (outcome.trigger === "catalog_miss" || outcome.trigger === "prescription" || outcome.trigger === "staff") return splitBubbles(outcome.reply);
  const messages: string[] = [];
  if (outcome.trigger === "ai" && outcome.reply && !settings.handoffMessage.trim()) messages.push(...splitBubbles(outcome.reply));
  if (settings.handoffMessage.trim()) messages.push(fillVariables(settings.handoffMessage, { customer: vars.customer ?? undefined, queue: vars.queue ?? undefined }, now));
  // Nunca transferência silenciosa: sem mensagem configurada nem resposta da IA, vai o aviso padrão.
  if (!messages.length) messages.push(defaultHandoffNotice(vars.customer));
  return messages;
}

// Perfis do teste da página /ia: arquivo próprio (sem leitura de disco) porque a tela /ia (client) também usa.
export { SIMULATED_PROFILES, type SimulatedProfileId } from "@/lib/ai/simulated-profiles";
import type { SimulatedProfileId } from "@/lib/ai/simulated-profiles";

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

/** queued: conversa já transferida e aguardando na fila sem atendente (espera assistida, alreadyQueued = true). */
export type QueuedState = { queueName: string | null };

/** Condições "@..." deste turno vindas do estado da conversa (os módulos sob demanda usam como gatilho). */
export function turnConditions(input: { settings: AiSettings; skills?: AiSkill[]; firstReply?: boolean; queued?: QueuedState | null; prompt?: Omit<PromptState, "hasGreetedInSession">; flags?: string[] }): string[] {
  const hasGreetedInSession = input.firstReply === false || !!input.queued;
  const skills = input.skills ?? input.prompt?.studio?.skills;
  const conditions = new Set<string>(["@atendimento", ...promptConditions({ ...input.prompt, studio: { ...input.prompt?.studio, skills }, hasGreetedInSession }), ...(input.flags ?? [])]);
  if (input.firstReply === true && !input.queued) conditions.add("@primeira_resposta");
  if (input.firstReply === false && !input.queued) conditions.add("@ja_respondeu");
  if (input.queued) conditions.add("@fila_espera");
  if (input.settings.aiChoosesQueue) conditions.add("@escolhe_fila");
  if (input.settings.closeWhenResolved) conditions.add("@pode_encerrar");
  for (const condition of skillConditions(skills)) conditions.add(condition);
  return [...conditions];
}

/**
 * Prompt de sistema (WhatsApp e teste de /ia): só os módulos Markdown ativos de /ia, na ordem de prioridade, com as
 * variáveis do turno preenchidas. Nenhum módulo ativo = system vazio (a chamada vai sem mensagem "system").
 */
export function assembleSystemPrompt(input: {
  modules: PromptModule[];
  settings: AiSettings;
  queues?: RoutingQueue[];
  info: string;
  /** Trechos do RAG e da memória semântica desta mensagem. */
  knowledge?: string;
  /** Fatos calculados pelo motor neste turno ({{contexto_do_turno}}). */
  extra?: string[];
  now?: Date;
  firstReply?: boolean;
  queued?: QueuedState | null;
  prompt?: Omit<PromptState, "hasGreetedInSession">;
  skills?: AiSkill[];
  flags?: string[];
}): AssembledPrompt {
  const now = input.now ?? new Date();
  const time = brasiliaGreeting(now);
  const conditions = turnConditions(input);
  const queueName = input.queued?.queueName?.trim();
  return assemblePrompt(input.modules, {
    conversationText: input.prompt?.conversationText ?? input.prompt?.text ?? "",
    conditions,
    vars: {
      nome_agente: input.settings.agentName,
      data_hora: formatBr(now, { dateStyle: "full", timeStyle: "short" }),
      hora: time.time,
      periodo: time.period,
      saudacao_periodo: time.greeting,
      base_conhecimento: input.info,
      trechos_conhecimento: input.knowledge ?? "",
      contexto_do_turno: (input.extra ?? []).filter(Boolean).join("\n\n"),
      filas: input.settings.aiChoosesQueue ? queueRoutingData(input.queues ?? [], input.settings.queueHints ?? {}) : "",
      fila_atual: input.queued ? (queueName ? `na fila ${queueName}` : "na fila de atendimento") : "",
    },
  });
}

export function buildSystemPrompt(input: Parameters<typeof assembleSystemPrompt>[0]): string {
  return assembleSystemPrompt(input).system;
}

export type DayPeriod = "manhã" | "tarde" | "noite";

/**
 * Período do dia no horário oficial de Brasília (independe do fuso do servidor):
 * 05:00–11:59 Bom dia, 12:00–17:59 Boa tarde, 18:00–04:59 Boa noite.
 */
export function brasiliaGreeting(now: Date = new Date()): { time: string; hour: number; period: DayPeriod; greeting: "Bom dia" | "Boa tarde" | "Boa noite" } {
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0) % 24;
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const time = `${String(hour).padStart(2, "0")}:${minute}`;
  if (hour >= 5 && hour < 12) return { time, hour, period: "manhã", greeting: "Bom dia" };
  if (hour >= 12 && hour < 18) return { time, hour, period: "tarde", greeting: "Boa tarde" };
  return { time, hour, period: "noite", greeting: "Boa noite" };
}
