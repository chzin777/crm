import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { advance, triggerMatches, type EnginePorts, type ExecutionContext, type ExecutionState, type TriggerEvent } from "@/lib/automations/engine";
import { sanitizeGraph, triggerNode, type FlowGraph } from "@/lib/automations/nodes";
import { addedTags, stageChanges } from "@/lib/automations/events";
import { addSystemMessage, firstDispatch, isWindowOpen } from "@/lib/chat/conversation";
import { sendAutomaticImage, sendAutomaticMessage } from "@/lib/chat/outbound";
import { readMenuState, saveMenuState } from "@/lib/chat/menu";
import { aiTakeoverPatch } from "@/lib/chat/queue-rules";
import { hoursFor } from "@/lib/chat/operations";
import { isOpenAt } from "@/lib/chat/hours";
import { phoneVariants } from "@/lib/chat/phone";
import { sendText } from "@/lib/meta-whatsapp";
import { resolveChatCapabilities } from "@/lib/permissions";
import { notifyChatChange } from "@/lib/chat/events";
import type { StageId } from "@/lib/pipeline-stages";

/** Motor das automações no banco: gatilhos, execução com trava entre containers (Blue/Green) e retomada do delay. */

const AUTHOR = "Automação";
const LOCK_MS = 5 * 60_000;
const RESUME_BATCH = 50;
const HOUR = 3_600_000;

type Target = { contactId: string; conversationId?: string | null; vars?: Record<string, string> };

async function conversationOf(state: ExecutionState) {
  if (state.conversationId) {
    const found = await prisma.chatConversation.findUnique({ where: { id: state.conversationId } });
    if (found) return found;
  }
  return prisma.chatConversation.findFirst({ where: { contactId: state.contactId }, orderBy: [{ closedAt: { sort: "desc", nulls: "first" } }, { lastMessageAt: { sort: "desc", nulls: "last" } }] });
}

async function requireConversation(state: ExecutionState) {
  const conversation = await conversationOf(state);
  if (!conversation) throw new Error("Contato sem conversa no WhatsApp.");
  return conversation;
}

async function supervisorIds() {
  const users = await prisma.user.findMany({ where: { banned: false }, select: { id: true, role: true, roleRef: { select: { permissions: true } } } });
  return users.filter((user) => resolveChatCapabilities(user.role, user.roleRef?.permissions)["chat.viewAll"]).map((user) => user.id);
}

async function setTags(state: ExecutionState, change: (tags: string[]) => string[]) {
  const conversation = await requireConversation(state);
  const tags = change(conversation.tags).slice(0, 20);
  await prisma.chatConversation.update({ where: { id: conversation.id }, data: { tags } });
  notifyChatChange();
  return { conversation, before: conversation.tags, tags };
}

/** Portas reais do motor (banco, WhatsApp, funil). */
export function databasePorts(flowId: string): EnginePorts {
  return {
    now: () => new Date(),
    isOptedOut: async (contactId) => !!(await prisma.contact.findUnique({ where: { id: contactId }, select: { marketingOptOut: true } }))?.marketingOptOut,
    facts: async (state) => {
      const [conversation, contact, { contactOpportunity }] = await Promise.all([conversationOf(state), prisma.contact.findUnique({ where: { id: state.contactId }, select: { city: true } }), import("@/lib/sales-pipeline-db")]);
      const opportunity = await contactOpportunity(state.contactId).catch(() => null);
      return { tags: conversation?.tags ?? [], stage: opportunity?.card?.coluna ?? null, city: contact?.city ?? null };
    },
    lastReply: async (state, since) => (await prisma.chatMessage.findFirst({ where: { conversation: { contactId: state.contactId }, author: "customer", createdAt: { gt: since } }, orderBy: { createdAt: "desc" }, select: { text: true } }))?.text ?? null,
    nextBusinessTime: async (date) => {
      const rule = await hoursFor(null).catch(() => null);
      if (!rule?.enabled) return date;
      // Avança de 15 em 15 minutos até o atendimento estar aberto (no máximo 8 dias).
      for (let probe = date.getTime(), limit = probe + 8 * 24 * HOUR; probe <= limit; probe += 15 * 60_000) if (isOpenAt(rule, new Date(probe))) return new Date(probe);
      return date;
    },
    sendWhatsApp: async (state, input) => {
      const conversation = await requireConversation(state);
      if (!isWindowOpen(conversation.lastInboundAt)) throw new Error("Janela de 24 h do WhatsApp fechada: o cliente precisa ter escrito nas últimas 24 h (fora dela, use um modelo em Campanhas).");
      if (!input.text.trim() && !input.mediaUrl) throw new Error("Mensagem vazia.");
      if (input.mediaUrl) {
        await sendAutomaticImage(conversation, input.mediaUrl, input.text, AUTHOR, async () => undefined);
        notifyChatChange();
        return "Imagem enviada no WhatsApp";
      }
      const message = await sendAutomaticMessage(conversation, input.text, undefined, undefined, AUTHOR);
      notifyChatChange();
      if (!message) throw new Error("Número bloqueado: mensagem não enviada.");
      if (message.delivery === "failed") throw new Error(message.failureReason ?? "Falha no envio pelo WhatsApp.");
      return "Mensagem enviada no WhatsApp";
    },
    aiAgent: async (state, objective) => {
      const conversation = await requireConversation(state);
      const menu = readMenuState(conversation.menuState);
      menu.aiActive = true;
      await prisma.chatConversation.update({ where: { id: conversation.id }, data: { ...aiTakeoverPatch(), assigneeId: null } });
      await saveMenuState(conversation.id, menu);
      await addSystemMessage(conversation.id, `Automação: atendimento passado para a IA.${objective ? ` Objetivo: ${objective}` : ""}`);
      notifyChatChange();
      return "Conversa com a IA (responde na próxima mensagem do cliente)";
    },
    moveStage: async (state, stage) => {
      const { contactOpportunity, createOpportunity, updateOpportunity } = await import("@/lib/sales-pipeline-db");
      const card = (await contactOpportunity(state.contactId)).card ?? (await createOpportunity({ contactId: state.contactId, conversationId: state.conversationId, author: AUTHOR }));
      if (!card) throw new Error("Contato sem oportunidade no funil.");
      const moved = await updateOpportunity({ contactId: state.contactId, cardId: card.id, column: stage as StageId, author: AUTHOR });
      if (!moved) throw new Error("Não foi possível mover a oportunidade.");
      return `Oportunidade movida para ${stage}`;
    },
    createOpportunity: async (state) => {
      const { createOpportunity } = await import("@/lib/sales-pipeline-db");
      const card = await createOpportunity({ contactId: state.contactId, conversationId: state.conversationId, author: AUTHOR });
      if (!card) throw new Error("Não foi possível criar a oportunidade.");
      return `Oportunidade em ${card.coluna}`;
    },
    addTag: async (state, tag) => {
      if (!tag) throw new Error("Tag vazia.");
      const { conversation, before, tags } = await setTags(state, (current) => (current.some((item) => item.toLowerCase() === tag.toLowerCase()) ? current : [...current, tag]));
      // Tag aplicada pela automação também dispara outros fluxos (nunca o próprio, evita laço).
      for (const added of addedTags(before, tags)) void triggerAutomations({ type: "trigger_tag", tag: added }, { contactId: state.contactId, conversationId: conversation.id }, { excludeFlowId: flowId }).catch(() => undefined);
      return `Tag "${tag}" adicionada`;
    },
    removeTag: async (state, tag) => {
      await setTags(state, (current) => current.filter((item) => item.toLowerCase() !== tag.toLowerCase()));
      return `Tag "${tag}" removida`;
    },
    assign: async (state, input) => {
      const conversation = await requireConversation(state);
      const queue = await prisma.chatQueue.findFirst({ where: { id: input.queueId, archivedAt: null }, select: { id: true, name: true } });
      if (!queue) throw new Error("Fila não encontrada.");
      const user = input.assigneeId ? await prisma.user.findFirst({ where: { id: input.assigneeId, banned: false }, select: { id: true, name: true } }) : null;
      const now = new Date();
      await prisma.chatConversation.update({ where: { id: conversation.id }, data: { queueId: queue.id, assigneeId: user?.id ?? null, status: user ? "in_progress" : "waiting", waitingSince: user ? null : now, closedAt: null } });
      await addSystemMessage(conversation.id, `Automação: conversa na fila ${queue.name}${user ? ` com ${user.name}` : ""}.`);
      notifyChatChange();
      return `Fila ${queue.name}${user ? ` · ${user.name}` : ""}`;
    },
    notify: async (state, input) => {
      const conversation = await conversationOf(state);
      const users = input.userIds.length ? input.userIds : await supervisorIds();
      if (users.length) await prisma.chatNotification.createMany({ data: [...new Set(users)].map((userId) => ({ userId, conversationId: conversation?.id ?? null, type: "automation", title: input.title.slice(0, 160) || "Automação", detail: input.message.slice(0, 500), href: conversation ? `/chat?c=${conversation.id}` : "/automacoes" })) });
      let whatsapp = "";
      if (input.whatsappPhone) whatsapp = await sendText(input.whatsappPhone, `${input.title}\n${input.message}`.trim()).then(() => " + alerta no WhatsApp", (error: unknown) => ` (alerta no WhatsApp falhou: ${error instanceof Error ? error.message : "erro"})`);
      notifyChatChange();
      return `${users.length} usuário(s) notificado(s)${whatsapp}`;
    },
    optOut: async (state) => {
      const contact = await prisma.contact.findUnique({ where: { id: state.contactId }, select: { phone: true } });
      if (contact?.phone) {
        const { applyOptOutCommand } = await import("@/lib/marketing-opt-out-db");
        await applyOptOutCommand(contact.phone, "opt_out", AUTHOR);
      } else {
        await prisma.contact.update({ where: { id: state.contactId }, data: { marketingOptOut: true, marketingOptOutAt: new Date(), marketingOptOutReason: AUTHOR } });
      }
      return "Contato marcado como opt-out (fora das campanhas)";
    },
    http: async (input) => {
      if (!/^https?:\/\//i.test(input.url)) throw new Error("URL inválida.");
      const response = await fetch(input.url, {
        method: input.method === "GET" ? "GET" : "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "crm-automacoes" },
        ...(input.method === "GET" ? {} : { body: input.body || "{}" }),
        signal: AbortSignal.timeout(8000),
      });
      const raw = (await response.text()).slice(0, 20_000);
      let data: unknown = raw;
      try { data = JSON.parse(raw); } catch { /* texto */ }
      return { status: response.status, data };
    },
    log: async (state, node, status, message) => {
      await prisma.automationStepLog.create({ data: { executionId: state.id, nodeId: node.id, nodeType: node.type, status, message: message.slice(0, 1000) } });
    },
  };
}

function toState(row: { id: string; flowId: string; contactId: string; conversationId: string | null; currentNodeId: string | null; context: unknown; startedAt: Date }): ExecutionState {
  const context = (row.context && typeof row.context === "object" ? row.context : {}) as Partial<ExecutionContext>;
  return { id: row.id, flowId: row.flowId, contactId: row.contactId, conversationId: row.conversationId, currentNodeId: row.currentNodeId, context: { vars: context.vars ?? {}, waitingNodeId: context.waitingNodeId ?? null, startedAt: context.startedAt ?? row.startedAt.toISOString(), ...(context.http ? { http: context.http } : {}) } };
}

/**
 * Executa (ou retoma) uma execução. A reserva atômica (updateMany com status/lockedUntil) garante que só um
 * container rode cada execução; fluxo pausado não retoma.
 */
export async function runExecution(executionId: string, ports?: EnginePorts) {
  const now = new Date();
  const claimed = await prisma.automationExecution.updateMany({
    where: { id: executionId, flow: { status: "active" }, OR: [{ status: "waiting", resumeAt: { lte: now } }, { status: "running", lockedUntil: { lt: now } }] },
    data: { status: "running", lockedUntil: new Date(now.getTime() + LOCK_MS) },
  });
  if (claimed.count === 0) return null;
  const row = await prisma.automationExecution.findUniqueOrThrow({ where: { id: executionId }, include: { flow: { select: { nodes: true, edges: true } } } });
  const graph: FlowGraph = sanitizeGraph(row.flow);
  const result = await advance(graph, toState(row), ports ?? databasePorts(row.flowId)).catch((error: unknown) => ({ status: "failed" as const, state: toState(row), error: error instanceof Error ? error.message : "Falha no motor." }));
  const finished = result.status !== "waiting";
  // Só grava se ninguém cancelou no meio (opt-out): cancelamento vence.
  await prisma.automationExecution.updateMany({
    where: { id: executionId, status: "running" },
    data: {
      status: result.status,
      currentNodeId: result.state.currentNodeId,
      context: result.state.context as unknown as Prisma.InputJsonValue,
      resumeAt: result.status === "waiting" ? result.resumeAt : null,
      lockedUntil: null,
      error: result.status === "failed" ? result.error.slice(0, 500) : result.status === "cancelled" ? result.reason : null,
      finishedAt: finished ? new Date() : null,
    },
  });
  return result.status;
}

async function contactVars(contactId: string): Promise<Record<string, string> | null> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { name: true, city: true, phone: true, marketingOptOut: true } });
  if (!contact || contact.marketingOptOut) return null;
  const full = contact.name?.trim() ?? "";
  return { nome: full.split(/\s+/)[0] ?? "", nome_completo: full, cidade: contact.city ?? "", telefone: contact.phone ?? "" };
}

/**
 * Evento real do CRM → inicia os fluxos ativos cujo gatilho casa. Um contato não entra de novo num fluxo em que
 * ainda está (rodando ou aguardando); quem pediu opt-out não entra em nenhum.
 */
export async function triggerAutomations(event: TriggerEvent, target: Target, options: { onlyFlowId?: string; excludeFlowId?: string; notStartedSince?: Date } = {}) {
  const flows = await prisma.automationFlow.findMany({ where: { status: "active", triggerType: event.type, ...(options.onlyFlowId ? { id: options.onlyFlowId } : {}), ...(options.excludeFlowId ? { id: { not: options.excludeFlowId } } : {}) } });
  if (!flows.length) return [];
  const base = await contactVars(target.contactId);
  if (!base) return [];
  const started: string[] = [];
  for (const flow of flows) {
    const graph = sanitizeGraph(flow);
    if (!triggerMatches(triggerNode(graph), event)) continue;
    const busy = await prisma.automationExecution.findFirst({ where: { flowId: flow.id, contactId: target.contactId, OR: [{ status: { in: ["running", "waiting"] } }, ...(options.notStartedSince ? [{ startedAt: { gte: options.notStartedSince } }] : [])] }, select: { id: true } });
    if (busy) continue;
    const now = new Date();
    const context: ExecutionContext = { vars: { ...base, ...(event.type === "trigger_message" ? { mensagem: event.text } : {}), ...(target.vars ?? {}) }, startedAt: now.toISOString() };
    const execution = await prisma.automationExecution.create({ data: { flowId: flow.id, contactId: target.contactId, conversationId: target.conversationId ?? null, status: "waiting", resumeAt: now, context: context as unknown as Prisma.InputJsonValue } });
    started.push(execution.id);
    await runExecution(execution.id).catch((error: unknown) => console.error(`[automacoes] execução ${execution.id}:`, error));
  }
  return started;
}

/** Relógio por minuto: retoma delays vencidos e execuções travadas de container que caiu. */
export async function resumeDueExecutions(now = new Date()) {
  const due = await prisma.automationExecution.findMany({
    where: { flow: { status: "active" }, OR: [{ status: "waiting", resumeAt: { lte: now } }, { status: "running", lockedUntil: { lt: now } }] },
    orderBy: { resumeAt: "asc" },
    take: RESUME_BATCH,
    select: { id: true },
  });
  let resumed = 0;
  for (const item of due) if (await runExecution(item.id)) resumed += 1;
  return resumed;
}

/** Gatilho "Cliente inativo por tempo": de hora em hora, contatos cuja última mensagem fez exatamente N dias. */
export async function checkInactiveTriggers(now = new Date()) {
  if (!(await firstDispatch(`automation-inactive:${now.toISOString().slice(0, 13)}`))) return 0;
  const flows = await prisma.automationFlow.findMany({ where: { status: "active", triggerType: "trigger_inactive" } });
  let started = 0;
  for (const flow of flows) {
    const days = Number((triggerNode(sanitizeGraph(flow))?.data.config.days as number | undefined) ?? 0);
    if (!(days > 0)) continue;
    const to = new Date(now.getTime() - days * 24 * HOUR);
    const from = new Date(to.getTime() - 24 * HOUR);
    const rows = await prisma.chatConversation.groupBy({ by: ["contactId"], _max: { lastInboundAt: true }, having: { lastInboundAt: { _max: { gte: from, lt: to } } }, orderBy: { contactId: "asc" }, take: 200 });
    for (const row of rows) {
      const ids = await triggerAutomations({ type: "trigger_inactive", days }, { contactId: row.contactId }, { onlyFlowId: flow.id, notStartedSince: new Date(now.getTime() - days * 24 * HOUR) });
      started += ids.length;
    }
  }
  return started;
}

/** Opt-out (SAIR/PARAR ou marcado pela equipe): interrompe na hora toda automação ativa dos contatos. */
export async function cancelAutomationsForContacts(contactIds: string[], reason = "Contato pediu opt-out (LGPD)") {
  if (!contactIds.length) return 0;
  const active = await prisma.automationExecution.findMany({ where: { contactId: { in: contactIds }, status: { in: ["running", "waiting"] } }, select: { id: true, currentNodeId: true } });
  if (!active.length) return 0;
  const result = await prisma.automationExecution.updateMany({ where: { id: { in: active.map((item) => item.id) }, status: { in: ["running", "waiting"] } }, data: { status: "cancelled", error: reason, finishedAt: new Date(), lockedUntil: null, resumeAt: null } });
  await prisma.automationStepLog.createMany({ data: active.map((item) => ({ executionId: item.id, nodeId: item.currentNodeId ?? "-", nodeType: "opt_out", status: "cancelled", message: reason })) });
  return result.count;
}

/** Cards do funil que mudaram de etapa → gatilho "Lead entrou na etapa". */
export function emitStageChanges(before: { id: string; contactId?: string; coluna: string }[], after: { id: string; contactId?: string; coluna: string }[]) {
  for (const change of stageChanges(before, after)) {
    void triggerAutomations({ type: "trigger_stage", stage: change.stage }, { contactId: change.contactId }).catch((error: unknown) => console.error("[automacoes] gatilho de etapa:", error));
  }
}

/** Tags novas numa conversa (pelo atendimento) → gatilho "Tag adicionada". */
export function emitTagChanges(conversation: { id: string; contactId: string }, before: string[], after: string[]) {
  for (const tag of addedTags(before, after)) {
    void triggerAutomations({ type: "trigger_tag", tag }, { contactId: conversation.contactId, conversationId: conversation.id }).catch((error: unknown) => console.error("[automacoes] gatilho de tag:", error));
  }
}

/** Mensagem do cliente → gatilho "Mensagem recebida". */
export function emitInboundMessage(conversation: { id: string; contactId: string }, text: string) {
  void triggerAutomations({ type: "trigger_message", text }, { contactId: conversation.contactId, conversationId: conversation.id }).catch((error: unknown) => console.error("[automacoes] gatilho de mensagem:", error));
}

/** Mesma coisa a partir do id da conversa (webhook do WhatsApp). */
export async function emitInboundMessageById(conversationId: string, text: string) {
  const conversation = await prisma.chatConversation.findUnique({ where: { id: conversationId }, select: { id: true, contactId: true } });
  if (conversation && text.trim()) emitInboundMessage(conversation, text);
}

/** Contatos dos telefones (opt-out por número marca todos os cadastros com ele). */
export async function contactIdsForPhone(phone: string) {
  return (await prisma.contact.findMany({ where: { phone: { in: phoneVariants(phone) } }, select: { id: true } })).map((item) => item.id);
}
