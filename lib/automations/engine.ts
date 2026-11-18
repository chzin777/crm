import { describeFilters, evaluateFilters, isTrigger, NODE_DEF, readDuration, readFilters, shiftDate, triggerNode, triggerNodes, type ContactFacts, type FlowEdge, type FlowGraph, type FlowNode } from "@/lib/automations/nodes";

export type { ContactFacts } from "@/lib/automations/nodes";

/**
 * Motor das automações: percorre o grafo a partir do nó atual da execução, executa cada passo pelas "portas"
 * (efeitos no CRM, injetados: banco/WhatsApp em produção, fakes nos testes) e para no Aguardar (delay), no fim,
 * em erro ou quando o contato pediu opt-out (LGPD). Cada nó pode ter Regras & Filtros: no gatilho decidem se o
 * disparo vale; nas ações, se o passo roda (senão pula ou encerra o ramo); na condição, entram no Sim/Não.
 */

export type ExecutionContext = {
  /** Variáveis do contato e do gatilho: nome, nome_completo, cidade, telefone, mensagem, campos do webhook. */
  vars: Record<string, string>;
  /** Nó Aguardar já agendado (na retomada ele é concluído e o fluxo segue). */
  waitingNodeId?: string | null;
  /** Início da execução (ISO): a "resposta do cliente" da condição é a mensagem recebida depois dele. */
  startedAt: string;
  /** Gatilho que iniciou a execução (fluxo com vários gatilhos). */
  triggerNodeId?: string | null;
  http?: Record<string, unknown>;
};

export type ExecutionState = {
  id: string;
  flowId: string;
  contactId: string;
  conversationId: string | null;
  currentNodeId: string | null;
  context: ExecutionContext;
};

export type StepStatus = "ok" | "error" | "waiting" | "skipped" | "cancelled";

/** Efeitos no CRM. Cada ação devolve uma mensagem curta para o log (ou lança erro). */
export type EnginePorts = {
  now: () => Date;
  isOptedOut: (contactId: string) => Promise<boolean>;
  facts: (state: ExecutionState) => Promise<ContactFacts>;
  lastReply: (state: ExecutionState, since: Date) => Promise<string | null>;
  nextBusinessTime: (date: Date) => Promise<Date>;
  sendWhatsApp: (state: ExecutionState, input: { text: string; mediaUrl: string }) => Promise<string>;
  aiAgent: (state: ExecutionState, objective: string) => Promise<string>;
  moveStage: (state: ExecutionState, stage: string) => Promise<string>;
  createOpportunity: (state: ExecutionState) => Promise<string>;
  addTag: (state: ExecutionState, tag: string) => Promise<string>;
  removeTag: (state: ExecutionState, tag: string) => Promise<string>;
  assign: (state: ExecutionState, input: { queueId: string; assigneeId: string }) => Promise<string>;
  notify: (state: ExecutionState, input: { userIds: string[]; title: string; message: string; whatsappPhone: string }) => Promise<string>;
  optOut: (state: ExecutionState) => Promise<string>;
  http: (input: { method: string; url: string; body: string }) => Promise<{ status: number; data: unknown }>;
  log: (state: ExecutionState, node: FlowNode, status: StepStatus, message: string) => Promise<void>;
};

export type AdvanceResult =
  | { status: "completed"; state: ExecutionState }
  | { status: "waiting"; state: ExecutionState; resumeAt: Date }
  | { status: "failed"; state: ExecutionState; error: string }
  | { status: "cancelled"; state: ExecutionState; reason: string };

const MAX_STEPS = 60;

/** {{nome}}, {{cidade}}, {{http.campo}}...: variáveis desconhecidas viram vazio. */
export function renderTemplate(text: string, context: ExecutionContext): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    if (key.startsWith("http.")) {
      const value = key.slice(5).split(".").reduce<unknown>((current, part) => (current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined), context.http);
      return value === undefined || value === null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    }
    return context.vars[key] ?? "";
  });
}

/** Quando o Aguardar termina (segundos a anos; meses/anos pelo calendário). */
export function delayUntil(now: Date, config: Record<string, unknown>): Date {
  const { amount, unit } = readDuration(config, "hours");
  return shiftDate(now, amount, unit, 1);
}

/** Limite da inatividade: última mensagem do cliente antes deste instante = inativo. */
export function inactiveSince(now: Date, config: Record<string, unknown>): Date {
  const { amount, unit } = readDuration(config, "days");
  return shiftDate(now, amount, unit, -1);
}

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Condição (se/senão) a partir dos dados do contato, da hora de Brasília e da resposta do cliente. */
export function evaluateCondition(config: Record<string, unknown>, input: { facts: ContactFacts; hour: number; reply: string | null }): boolean {
  const field = String(config.field ?? "reply");
  const operator = String(config.operator ?? "exists");
  const expected = plain(String(config.value ?? ""));
  if (field === "none") return true;
  if (field === "hour") {
    const value = Number(config.value);
    if (operator === "gte") return input.hour >= value;
    if (operator === "lt") return input.hour < value;
    return input.hour === value;
  }
  const values = field === "tag" ? input.facts.tags : field === "stage" ? [input.facts.stage ?? ""] : field === "city" ? [input.facts.city ?? ""] : [input.reply ?? ""];
  const present = values.map(plain).filter(Boolean);
  if (operator === "exists") return expected ? present.some((item) => item.includes(expected)) : present.length > 0;
  if (operator === "equals") return present.some((item) => item === expected);
  if (operator === "contains") return present.some((item) => item.includes(expected));
  if (operator === "not_contains") return !present.some((item) => item.includes(expected));
  return false;
}

/** Próximo nó: na condição pelo caminho Sim/Não; nos demais, a primeira conexão de saída. */
export function nextNodeId(graph: FlowGraph, node: FlowNode, branch?: boolean): string | null {
  const out: FlowEdge[] = graph.edges.filter((edge) => edge.source === node.id);
  if (node.type === "condition") return out.find((edge) => edge.sourceHandle === (branch ? "true" : "false"))?.target ?? null;
  return out[0]?.target ?? null;
}

const brasiliaHour = (date: Date) => Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(date)) % 24;

/** Executa um passo (sem o delay, tratado em advance). Devolve a mensagem do log e, na condição, o caminho. */
async function runNode(node: FlowNode, state: ExecutionState, ports: EnginePorts): Promise<{ message: string; branch?: boolean }> {
  const config = node.data.config;
  const text = (key: string) => renderTemplate(String(config[key] ?? ""), state.context);
  switch (node.type) {
    case "send_whatsapp": return { message: await ports.sendWhatsApp(state, { text: text("text"), mediaUrl: text("mediaUrl") }) };
    case "ai_agent": return { message: await ports.aiAgent(state, text("objective")) };
    case "move_stage": return { message: await ports.moveStage(state, String(config.stage ?? "")) };
    case "create_opportunity": return { message: await ports.createOpportunity(state) };
    case "add_tag": return { message: await ports.addTag(state, text("tag").trim()) };
    case "remove_tag": return { message: await ports.removeTag(state, text("tag").trim()) };
    case "assign": return { message: await ports.assign(state, { queueId: String(config.queueId ?? ""), assigneeId: String(config.assigneeId ?? "") }) };
    case "notify": return { message: await ports.notify(state, { userIds: Array.isArray(config.userIds) ? config.userIds.map(String) : [], title: text("title"), message: text("message"), whatsappPhone: String(config.whatsappPhone ?? "").replace(/\D/g, "") }) };
    case "opt_out": return { message: await ports.optOut(state) };
    case "http": {
      const response = await ports.http({ method: String(config.method ?? "POST"), url: text("url"), body: text("body") });
      state.context.http = response.data && typeof response.data === "object" ? (response.data as Record<string, unknown>) : { body: response.data };
      if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
      return { message: `HTTP ${response.status}` };
    }
    case "condition": {
      const filters = readFilters(config);
      const needsFacts = config.field !== "none" || filters.rules.length > 0;
      const [facts, reply] = await Promise.all([needsFacts ? ports.facts(state) : Promise.resolve({ tags: [], stage: null, city: null } as ContactFacts), config.field === "reply" ? ports.lastReply(state, new Date(state.context.startedAt)) : Promise.resolve(null)]);
      const check = evaluateCondition(config, { facts, hour: brasiliaHour(ports.now()), reply });
      const rules = evaluateFilters(filters, facts);
      const branch = check && rules;
      const detail = filters.rules.length ? ` (regras: ${describeFilters(filters)} → ${rules ? "atendidas" : "não atendidas"})` : "";
      return { message: `${branch ? "Condição verdadeira: caminho Sim" : "Condição falsa: caminho Não"}${detail}`, branch };
    }
    default: return { message: "" };
  }
}

/**
 * Avança a execução até o próximo Aguardar, o fim, um erro ou o opt-out. Nó de gatilho é só o início: passa direto.
 * Retomada do Aguardar: o nó em waitingNodeId é concluído e o fluxo segue para o próximo.
 */
export async function advance(graph: FlowGraph, input: ExecutionState, ports: EnginePorts): Promise<AdvanceResult> {
  const state: ExecutionState = { ...input, context: { ...input.context, vars: { ...input.context.vars } } };
  if (!state.currentNodeId) state.currentNodeId = (state.context.triggerNodeId && graph.nodes.some((node) => node.id === state.context.triggerNodeId) ? state.context.triggerNodeId : triggerNode(graph)?.id) ?? null;
  let facts: ContactFacts | null = null;
  const loadFacts = async () => (facts ??= await ports.facts(state));
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const node = graph.nodes.find((item) => item.id === state.currentNodeId);
    if (!node) return { status: "completed", state: { ...state, currentNodeId: null } };
    // LGPD: contato que pediu SAIR não recebe mais nada de nenhuma automação.
    if (await ports.isOptedOut(state.contactId)) {
      await ports.log(state, node, "cancelled", "Contato pediu opt-out: automação interrompida.");
      return { status: "cancelled", state, reason: "opt-out" };
    }
    if (isTrigger(node.type)) {
      await ports.log(state, node, "ok", `Gatilho: ${NODE_DEF[node.type].label}`);
      state.currentNodeId = nextNodeId(graph, node);
      continue;
    }
    // Regras & Filtros da ação (a condição usa as regras no Sim/Não). Retomada de Aguardar não reavalia.
    const filters = readFilters(node.data.config);
    if (node.type !== "condition" && filters.rules.length && state.context.waitingNodeId !== node.id) {
      facts = null;
      if (!evaluateFilters(filters, await loadFacts())) {
        const rules = describeFilters(filters);
        if (filters.onFail === "stop") {
          await ports.log(state, node, "skipped", `Regras não atendidas (${rules}): ramo encerrado.`);
          return { status: "completed", state: { ...state, currentNodeId: null } };
        }
        await ports.log(state, node, "skipped", `Regras não atendidas (${rules}): passo pulado.`);
        state.currentNodeId = nextNodeId(graph, node);
        continue;
      }
    }
    if (node.type === "delay") {
      if (state.context.waitingNodeId !== node.id) {
        let resumeAt = delayUntil(ports.now(), node.data.config);
        if (node.data.config.businessHours === true) resumeAt = await ports.nextBusinessTime(resumeAt);
        state.context.waitingNodeId = node.id;
        await ports.log(state, node, "waiting", `Aguardando até ${resumeAt.toISOString()}`);
        return { status: "waiting", state, resumeAt };
      }
      state.context.waitingNodeId = null;
      await ports.log(state, node, "ok", "Espera concluída");
      state.currentNodeId = nextNodeId(graph, node);
      continue;
    }
    try {
      const result = await runNode(node, state, ports);
      await ports.log(state, node, "ok", result.message);
      state.currentNodeId = nextNodeId(graph, node, result.branch);
      // Ações mudam tags/etapa/fila: as próximas regras releem os dados.
      facts = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha no passo.";
      await ports.log(state, node, "error", message);
      return { status: "failed", state, error: message };
    }
  }
  return { status: "failed", state, error: "Fluxo com passos demais (possível laço)." };
}

/** Evento real do CRM. Inatividade aponta o nó de gatilho (cada um tem seu tempo). */
export type TriggerEvent =
  | { type: "trigger_message"; text: string }
  | { type: "trigger_stage"; stage: string }
  | { type: "trigger_tag"; tag: string }
  | { type: "trigger_inactive"; nodeId: string }
  | { type: "trigger_webhook" }
  | { type: "trigger_ai_handoff"; queueId: string | null };

/** Este nó de gatilho casa com o evento? (sem as regras & filtros, avaliadas em pickTrigger). */
export function triggerMatches(node: FlowNode | null, event: TriggerEvent): boolean {
  if (!node || node.type !== event.type) return false;
  const config = node.data.config;
  if (event.type === "trigger_message") {
    if (config.mode !== "keywords") return true;
    const keywords = (Array.isArray(config.keywords) ? config.keywords : []).map((item) => plain(String(item))).filter(Boolean);
    const text = plain(event.text);
    return keywords.some((keyword) => new RegExp(`(^|[^a-z0-9])${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text));
  }
  if (event.type === "trigger_stage") return String(config.stage ?? "") === event.stage;
  if (event.type === "trigger_tag") return plain(String(config.tag ?? "")) === plain(event.tag);
  if (event.type === "trigger_inactive") return node.id === event.nodeId;
  if (event.type === "trigger_ai_handoff") return !String(config.queueId ?? "") || String(config.queueId) === event.queueId;
  return true;
}

/**
 * Fluxo com vários gatilhos: o primeiro (na ordem do canvas) que casa com o evento e passa nas suas Regras &
 * Filtros inicia a execução a partir dele. Os dados do contato só são lidos se algum gatilho tiver regras.
 */
export async function pickTrigger(graph: FlowGraph, event: TriggerEvent, loadFacts: () => Promise<ContactFacts>): Promise<FlowNode | null> {
  let facts: ContactFacts | null = null;
  for (const node of triggerNodes(graph)) {
    if (!triggerMatches(node, event)) continue;
    const filters = readFilters(node.data.config);
    if (!filters.rules.length) return node;
    facts ??= await loadFacts();
    if (evaluateFilters(filters, facts)) return node;
  }
  return null;
}
