import { isPresenceMode, type PresenceMode } from "@/lib/chat/presence";
import { TIERS } from "@/lib/scoring";
import { readDistribute, describeBusinessWindow, nextBusinessOpening, outputHandles, pickVariant, readVariants, variantLetter, describeFilters, evaluateFilters, isErpTrigger, isTrigger, type ErpTriggerType, NODE_DEF, readDuration, readFilters, shiftDate, triggerNode, triggerNodes, type ContactFacts, type FlowEdge, type FlowGraph, type FlowNode, type NoteTarget } from "@/lib/automations/nodes";

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
  /** Aguardar resposta: instante (ISO) a partir do qual uma mensagem do cliente conta como resposta. */
  replySince?: string | null;
  /** Teste A/B: variante sorteada por nó ({ "ab-1": "A" }), para atribuição de resultados. */
  variants?: Record<string, string>;
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
  /** audio: URL http(s) ou "storage:<chave>" (upload), enviado como nota de voz. presence: digitando/gravando antes de cada bloco. */
  sendWhatsApp: (state: ExecutionState, input: { text: string; mediaUrl: string; audio?: string; presence?: { mode: PresenceMode; seconds: number | null }; trackLinks?: boolean }) => Promise<string>;
  aiAgent: (state: ExecutionState, objective: string) => Promise<string>;
  moveStage: (state: ExecutionState, stage: string) => Promise<string>;
  createOpportunity: (state: ExecutionState) => Promise<string>;
  addTag: (state: ExecutionState, tag: string) => Promise<string>;
  removeTag: (state: ExecutionState, tag: string) => Promise<string>;
  assign: (state: ExecutionState, input: { queueId: string; assigneeId: string }) => Promise<string>;
  notify: (state: ExecutionState, input: { userIds: string[]; title: string; message: string; whatsappPhone: string }) => Promise<string>;
  optOut: (state: ExecutionState) => Promise<string>;
  /** Nota interna na oportunidade aberta e/ou no cadastro do contato (sem oportunidade: vai para o contato). */
  addNote: (state: ExecutionState, input: { target: NoteTarget; text: string }) => Promise<string>;
  http: (input: { method: string; url: string; body: string }) => Promise<{ status: number; data: unknown }>;
  log: (state: ExecutionState, node: FlowNode, status: StepStatus, message: string) => Promise<void>;
  /** Encaminha o contato para outra automação ativa (começa do primeiro passo dela). */
  gotoFlow?: (state: ExecutionState, flowId: string) => Promise<string>;
  /** Lead Score: soma (delta > 0) ou tira pontos com motivo. */
  changeScore?: (state: ExecutionState, delta: number, reason: string) => Promise<string>;
  /** Campo personalizado do contato (valor já com as variáveis aplicadas). */
  updateField?: (state: ExecutionState, key: string, value: string) => Promise<string>;
  /** Sorteio do Teste A/B (0 a 1); padrão Math.random. */
  random?: () => number;
  /** Roleta de vendedores: atribui a conversa a um vendedor elegível; assigned=false segue pela saída "Sem vendedor". */
  distribute?: (state: ExecutionState, input: DistributeInput) => Promise<{ assigned: boolean; message: string }>;
  /** Métricas do canvas: entrou no nó, concluiu ou falhou. */
  count?: (state: ExecutionState, node: FlowNode, kinds: NodeCountKind[]) => Promise<void>;
};

export type NodeCountKind = "entered" | "completed" | "error";
export type DistributeInput = { pool: "queue" | "users"; queueId: string; userIds: string[]; mode: "round_robin" | "least_load"; onlyOnline: boolean; respectShift: boolean; maxActive: number; noteOnOpportunity: boolean };

export type AdvanceResult =
  | { status: "completed"; state: ExecutionState }
  | { status: "waiting"; state: ExecutionState; resumeAt: Date }
  | { status: "failed"; state: ExecutionState; error: string }
  | { status: "cancelled"; state: ExecutionState; reason: string };

const MAX_STEPS = 60;

/** Nomes com ponto equivalentes às variáveis curtas ({{contato.nome}} = {{nome}}, {{mensagem.texto}} = {{mensagem}}). */
const VAR_ALIASES: Record<string, string> = {
  "contato.nome": "nome", "contato.primeiro_nome": "nome", "contato.nome_completo": "nome_completo", "contato.cidade": "cidade", "contato.telefone": "telefone",
  "mensagem.texto": "mensagem", "cliente.nome": "nome", "cliente.cidade": "cidade", "cliente.telefone": "telefone",
};

/** Valor de uma variável da execução (com os apelidos acima); desconhecida = vazio. */
export function readVar(vars: Record<string, string>, key: string): string {
  const name = key.trim().replace(/^\{\{\s*|\s*\}\}$/g, "");
  return vars[name] ?? vars[VAR_ALIASES[name] ?? ""] ?? "";
}

/** {{nome}}, {{contato.nome}}, {{cidade}}, {{http.campo}}...: variáveis desconhecidas viram vazio. */
export function renderTemplate(text: string, context: ExecutionContext): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    if (key.startsWith("http.")) {
      const value = key.slice(5).split(".").reduce<unknown>((current, part) => (current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined), context.http);
      return value === undefined || value === null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    }
    return readVar(context.vars, key);
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
export function evaluateCondition(config: Record<string, unknown>, input: { facts: ContactFacts; hour: number; reply: string | null; vars?: Record<string, string> }): boolean {
  const field = String(config.field ?? "reply");
  const operator = String(config.operator ?? "exists");
  const expected = plain(String(config.value ?? ""));
  if (field === "none") return true;
  if (field === "hour") {
    const value = Number(config.value);
    if (operator === "gte") return input.hour >= value;
    if (operator === "lt") return input.hour < value;
    if (operator === "not_equals") return input.hour !== value;
    return input.hour === value;
  }
  const vars = input.vars ?? {};
  const values = field === "tag" ? input.facts.tags
    : field === "stage" ? [input.facts.stage ?? ""]
    : field === "city" ? [input.facts.city ?? ""]
    : field === "message" ? [readVar(vars, "mensagem")]
    : field === "variable" ? [readVar(vars, String(config.variable ?? ""))]
    : [input.reply ?? ""];
  const present = values.map(plain).filter(Boolean);
  // "exists" com valor (fluxos antigos) funciona como "contém".
  if (operator === "exists") return expected ? present.some((item) => item.includes(expected)) : present.length > 0;
  if (operator === "empty") return present.length === 0;
  if (operator === "equals") return present.some((item) => item === expected);
  if (operator === "not_equals") return !present.some((item) => item === expected);
  if (operator === "contains") return present.some((item) => item.includes(expected));
  if (operator === "not_contains") return !present.some((item) => item.includes(expected));
  if (operator === "gte" || operator === "lt") {
    const number = Number(String(present[0] ?? "").replace(",", "."));
    const limit = Number(expected.replace(",", "."));
    if (!present.length || Number.isNaN(number) || Number.isNaN(limit)) return false;
    return operator === "gte" ? number >= limit : number < limit;
  }
  return false;
}

/** Próximo nó: na condição pelo caminho Sim/Não; nos demais, a primeira conexão de saída. */
/** Próximo nó: pela saída rotulada (condição, aguardar resposta, teste A/B) ou pela saída única. */
export function nextNodeId(graph: FlowGraph, node: FlowNode, handle?: boolean | string | null): string | null {
  const out: FlowEdge[] = graph.edges.filter((edge) => edge.source === node.id);
  const outputs = outputHandles(node.type, node.data.config);
  if (outputs && !outputs.length) return null;
  if (outputs) {
    const id = typeof handle === "boolean" ? (handle ? "true" : "false") : handle;
    return out.find((edge) => edge.sourceHandle === id)?.target ?? null;
  }
  return out[0]?.target ?? null;
}

const brasiliaHour = (date: Date) => Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(date)) % 24;

/** Executa um passo (sem o delay, tratado em advance). Devolve a mensagem do log e, na condição, o caminho. */
async function runNode(node: FlowNode, state: ExecutionState, ports: EnginePorts): Promise<{ message: string; branch?: boolean | string; end?: boolean }> {
  const config = node.data.config;
  const text = (key: string) => renderTemplate(String(config[key] ?? ""), state.context);
  switch (node.type) {
    case "send_whatsapp": {
      const seconds = config.presenceSeconds === undefined || config.presenceSeconds === "" ? null : Number(config.presenceSeconds);
      const presence = { mode: isPresenceMode(config.presenceMode) ? config.presenceMode : "auto" as const, seconds };
      return { message: await ports.sendWhatsApp(state, { text: text("text"), mediaUrl: text("mediaUrl"), audio: text("audio").trim(), presence, trackLinks: config.trackLinks === true }) };
    }
    case "change_score": {
      if (!ports.changeScore) throw new Error("Pontuação indisponível.");
      const amount = Math.max(0, Math.round(Number(config.amount) || 0));
      if (!amount) throw new Error("Informe quantos pontos.");
      const delta = config.operation === "subtract" ? -amount : amount;
      const reason = text("reason").trim() || "Automação";
      return { message: await ports.changeScore(state, delta, reason) };
    }
    case "update_field": {
      if (!ports.updateField) throw new Error("Campos personalizados indisponíveis.");
      const key = String(config.fieldKey ?? "").trim();
      if (!key) throw new Error("Escolha o campo.");
      return { message: await ports.updateField(state, key, text("value")) };
    }
    case "ai_agent": return { message: await ports.aiAgent(state, text("objective")) };
    case "move_stage": return { message: await ports.moveStage(state, String(config.stage ?? "")) };
    case "create_opportunity": return { message: await ports.createOpportunity(state) };
    case "add_tag": return { message: await ports.addTag(state, text("tag").trim()) };
    case "remove_tag": return { message: await ports.removeTag(state, text("tag").trim()) };
    case "assign": return { message: await ports.assign(state, { queueId: String(config.queueId ?? ""), assigneeId: String(config.assigneeId ?? "") }) };
    case "distribute_lead": {
      if (!ports.distribute) throw new Error("Roleta de vendedores indisponível.");
      const result = await ports.distribute(state, readDistribute(config));
      return { message: result.message, branch: result.assigned ? "assigned" : "unavailable" };
    }
    case "notify": return { message: await ports.notify(state, { userIds: Array.isArray(config.userIds) ? config.userIds.map(String) : [], title: text("title"), message: text("message"), whatsappPhone: String(config.whatsappPhone ?? "").replace(/\D/g, "") }) };
    case "add_note": {
      const note = text("text").trim();
      if (!note) throw new Error("Observação vazia.");
      const target = config.target === "contact" || config.target === "both" ? config.target : "opportunity";
      return { message: await ports.addNote(state, { target, text: note.slice(0, 4000) }) };
    }
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
      const check = evaluateCondition(config, { facts, hour: brasiliaHour(ports.now()), reply, vars: state.context.vars });
      const rules = evaluateFilters(filters, facts);
      const branch = check && rules;
      const detail = filters.rules.length ? ` (regras: ${describeFilters(filters)} → ${rules ? "atendidas" : "não atendidas"})` : "";
      return { message: `${branch ? "Condição verdadeira: caminho Sim" : "Condição falsa: caminho Não"}${detail}`, branch };
    }
    case "ab_split": {
      const weights = readVariants(config);
      // Sorteio uma única vez por contato e nó: a variante fica gravada na execução (atribuição de resultados).
      const saved = state.context.variants?.[node.id];
      const index = saved ? Math.max(0, saved.charCodeAt(0) - 65) : pickVariant(weights, (ports.random ?? Math.random)());
      const letter = variantLetter(index);
      state.context.variants = { ...(state.context.variants ?? {}), [node.id]: letter };
      state.context.vars.variante = letter;
      return { message: `Teste A/B: Variante ${letter} (${weights[index] ?? 0}%)`, branch: `v${index}` };
    }
    case "end_flow": {
      if (config.mode !== "goto") return { message: "Fluxo encerrado", end: true };
      const flowId = String(config.flowId ?? "");
      if (!flowId) throw new Error("Escolha a automação de destino.");
      if (flowId === state.flowId) throw new Error("A automação de destino precisa ser outra.");
      if (!ports.gotoFlow) throw new Error("Encaminhamento indisponível.");
      return { message: await ports.gotoFlow(state, flowId), end: true };
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
  // Métricas do canvas nunca derrubam a execução.
  const count = async (node: FlowNode, ...kinds: NodeCountKind[]) => { await ports.count?.(state, node, kinds).catch(() => undefined); };
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
      await count(node, "entered", "completed");
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
          await count(node, "entered");
          return { status: "completed", state: { ...state, currentNodeId: null } };
        }
        await ports.log(state, node, "skipped", `Regras não atendidas (${rules}): passo pulado.`);
        await count(node, "entered", "completed");
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
        await count(node, "entered");
        return { status: "waiting", state, resumeAt };
      }
      state.context.waitingNodeId = null;
      await ports.log(state, node, "ok", "Espera concluída");
      await count(node, "completed");
      state.currentNodeId = nextNodeId(graph, node);
      continue;
    }
    if (node.type === "business_hours") {
      if (state.context.waitingNodeId !== node.id) {
        const opening = nextBusinessOpening(ports.now(), node.data.config);
        if (opening) {
          state.context.waitingNodeId = node.id;
          await ports.log(state, node, "waiting", `Fora do horário útil (${describeBusinessWindow(node.data.config)}): retoma em ${opening.toISOString()}`);
          await count(node, "entered");
          return { status: "waiting", state, resumeAt: opening };
        }
        await ports.log(state, node, "ok", "Dentro do horário útil: segue na hora");
        await count(node, "entered", "completed");
      } else {
        state.context.waitingNodeId = null;
        await ports.log(state, node, "ok", "Horário útil aberto: fluxo retomado");
        await count(node, "completed");
      }
      state.currentNodeId = nextNodeId(graph, node);
      continue;
    }
    if (node.type === "wait_reply") {
      if (state.context.waitingNodeId !== node.id) {
        const now = ports.now();
        const resumeAt = delayUntil(now, { ...node.data.config, unit: node.data.config.unit ?? "days" });
        state.context.waitingNodeId = node.id;
        state.context.replySince = now.toISOString();
        await ports.log(state, node, "waiting", `Aguardando resposta do cliente até ${resumeAt.toISOString()}`);
        await count(node, "entered");
        return { status: "waiting", state, resumeAt };
      }
      const since = new Date(state.context.replySince ?? state.context.startedAt);
      const reply = await ports.lastReply(state, since);
      state.context.waitingNodeId = null;
      state.context.replySince = null;
      if (reply !== null) state.context.vars.resposta = reply;
      await ports.log(state, node, "ok", reply !== null ? "Cliente respondeu no prazo" : "Sem resposta no prazo: caminho Timeout");
      await count(node, "completed");
      state.currentNodeId = nextNodeId(graph, node, reply !== null ? "replied" : "timeout");
      continue;
    }
    try {
      const result = await runNode(node, state, ports);
      await ports.log(state, node, "ok", result.message);
      await count(node, "entered", "completed");
      if (result.end) return { status: "completed", state: { ...state, currentNodeId: null } };
      state.currentNodeId = nextNodeId(graph, node, result.branch);
      // Ações mudam tags/etapa/fila: as próximas regras releem os dados.
      facts = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha no passo.";
      await ports.log(state, node, "error", message);
      await count(node, "entered", "error");
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
  | { type: "trigger_ai_handoff"; queueId: string | null }
  | { type: "trigger_link_click"; url: string }
  /** Lead Score mudou de previous para score: dispara nos nós cujo valor foi cruzado para cima. */
  | { type: "trigger_score"; score: number; previous: number }
  | { type: "trigger_tier"; tier: string; previous: string }
  /** Gatilhos do VMSet: o sincronizador já filtrou pelo nó (tempo, valor, loja); aqui só confere o nó. */
  | { type: ErpTriggerType; nodeId: string };

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
  if (event.type === "trigger_inactive" || isErpTrigger(event.type)) return "nodeId" in event && node.id === event.nodeId;
  if (event.type === "trigger_ai_handoff") return !String(config.queueId ?? "") || String(config.queueId) === event.queueId;
  if (event.type === "trigger_link_click") return !plain(String(config.urlContains ?? "")) || plain(event.url).includes(plain(String(config.urlContains)));
  if (event.type === "trigger_score") {
    const target = Number(config.amount) || 0;
    return target > 0 && event.previous < target && event.score >= target;
  }
  if (event.type === "trigger_tier") {
    const wanted = String(config.tier ?? "any");
    const rank = (tier: string) => TIERS.indexOf(tier as (typeof TIERS)[number]);
    const direction = rank(event.tier) > rank(event.previous) ? "up" : "down";
    return (wanted === "any" || wanted === event.tier) && (config.direction === "any" || !config.direction || config.direction === direction);
  }
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
