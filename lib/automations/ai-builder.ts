import { ACTION_TYPES, FILTER_KINDS, NODE_DEF, sanitizeGraph, STAGE_OPTIONS, TIME_UNITS, TRIGGER_TYPES, type FlowEdge, type FlowGraph, type FlowNode, type NodeType } from "@/lib/automations/nodes";

/**
 * Criação de automação com IA: o modelo devolve um rascunho (gatilho + passos) num JSON Schema estrito com
 * apenas os nós reais do motor; aqui o rascunho vira grafo validado, com posições calculadas para o canvas.
 * Puro: usado pela rota e pelos testes.
 */

export type BuilderWorkspace = { queues: { id: string; name: string }[]; users: { id: string; name: string }[] };

/** Parâmetros possíveis de qualquer nó (strict exige todos; o que não se aplica vem null). */
const PARAM_KEYS = {
  mode: { type: ["string", "null"], enum: ["any", "keywords", null] },
  keywords: { type: ["array", "null"], items: { type: "string" } },
  stage: { type: ["string", "null"], enum: [...STAGE_OPTIONS.map((item) => item.value), null] },
  tag: { type: ["string", "null"] },
  amount: { type: ["number", "null"] },
  unit: { type: ["string", "null"], enum: [...TIME_UNITS, null] },
  businessHours: { type: ["boolean", "null"] },
  queueId: { type: ["string", "null"] },
  assigneeId: { type: ["string", "null"] },
  userIds: { type: ["array", "null"], items: { type: "string" } },
  text: { type: ["string", "null"] },
  mediaUrl: { type: ["string", "null"] },
  objective: { type: ["string", "null"] },
  title: { type: ["string", "null"] },
  message: { type: ["string", "null"] },
  whatsappPhone: { type: ["string", "null"] },
  field: { type: ["string", "null"], enum: ["none", "tag", "stage", "city", "hour", "reply", null] },
  operator: { type: ["string", "null"], enum: ["equals", "contains", "not_contains", "exists", "gte", "lt", null] },
  value: { type: ["string", "null"] },
  method: { type: ["string", "null"], enum: ["GET", "POST", null] },
  url: { type: ["string", "null"] },
  body: { type: ["string", "null"] },
} as const;

const strictObject = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

const FILTERS_SCHEMA = {
  anyOf: [
    { type: "null" },
    strictObject({
      combinator: { type: "string", enum: ["and", "or"] },
      onFail: { type: "string", enum: ["skip", "stop"] },
      rules: { type: "array", items: strictObject({ kind: { type: "string", enum: FILTER_KINDS.map((item) => item.kind) }, op: { type: "string", enum: [...new Set(FILTER_KINDS.flatMap((item) => item.ops.map((op) => op.value)))] }, value: { type: ["string", "null"] } }) },
    }),
  ],
};

export const AUTOMATION_DRAFT_SCHEMA = strictObject({
  name: { type: "string" },
  description: { type: "string" },
  trigger: strictObject({ type: { type: "string", enum: [...TRIGGER_TYPES] }, params: strictObject(PARAM_KEYS), filters: FILTERS_SCHEMA }),
  steps: {
    type: "array",
    items: strictObject({
      id: { type: "string" },
      type: { type: "string", enum: [...ACTION_TYPES] },
      params: strictObject(PARAM_KEYS),
      filters: FILTERS_SCHEMA,
      next: { type: ["string", "null"] },
      nextTrue: { type: ["string", "null"] },
      nextFalse: { type: ["string", "null"] },
    }),
  },
});

type Params = Partial<Record<keyof typeof PARAM_KEYS, unknown>>;
type DraftFilters = { combinator?: unknown; onFail?: unknown; rules?: unknown } | null;
type DraftStep = { id?: unknown; type?: unknown; params?: Params | null; filters?: DraftFilters; next?: unknown; nextTrue?: unknown; nextFalse?: unknown };
export type AutomationDraft = { name?: unknown; description?: unknown; trigger?: { type?: unknown; params?: Params | null; filters?: DraftFilters } | null; steps?: unknown };

/** Catálogo, etapas, filas e usuários para o prompt (só ids reais). */
export function builderSystemPrompt(workspace: BuilderWorkspace): string {
  const catalog = Object.values(NODE_DEF)
    .map((def) => `- ${def.type} (${def.label}): ${def.description}${def.fields.length ? ` Parâmetros: ${def.fields.map((field) => field.key).join(", ")}.` : ""}`)
    .join("\n");
  const filters = FILTER_KINDS.map((item) => `- ${item.kind}: ${item.ops.map((op) => `${op.value}${op.needsValue ? ` (value = ${op.needsValue === "queue" ? "id da fila" : op.needsValue === "stage" ? "id da etapa" : "texto"})` : ""}`).join(" | ")}`).join("\n");
  return [
    "Você monta automações do CRM de uma ótica (WhatsApp, funil de vendas, tags, filas e IA) a partir do pedido do usuário.",
    "Responda só com o JSON do schema: 1 gatilho e a sequência de passos. Use apenas os tipos e parâmetros abaixo; parâmetro que não se aplica ao tipo vem null.",
    "",
    "Nós disponíveis:",
    catalog,
    "",
    "Regras:",
    "- steps[0] é o primeiro passo depois do gatilho. Cada passo aponta o próximo em next (id de um passo POSTERIOR na lista) ou null para encerrar.",
    "- Só o tipo condition usa nextTrue (caminho Sim) e nextFalse (caminho Não); nos demais, nextTrue e nextFalse são null. Na condition, next é null.",
    "- Ids curtos e únicos (ex.: s1, s2). Nunca aponte para um passo anterior (sem laços).",
    "- Tempo: amount + unit (seconds, minutes, hours, days, months, years). Mensagens de WhatsApp fora da janela de 24 h podem não ser entregues: em esperas longas prefira notificar a equipe.",
    "- Mensagens em português do Brasil, curtas e cordiais, com variáveis {{nome}}, {{cidade}}, {{telefone}} quando fizer sentido. Sem emojis em excesso.",
    "- trigger_message com mode keywords exige keywords; tags em minúsculas e com hífen (ex.: cliente-vip).",
    "- assign exige queueId de uma fila listada; assigneeId e userIds só com ids de usuários listados. Sem fila adequada, use notify.",
    "- filters (Regras & Filtros) só quando o pedido restringir o público (ex.: só clientes, só uma cidade); senão null.",
    "- name: título curto da automação. description: uma frase do que ela faz.",
    "",
    `Etapas do funil (stage): ${STAGE_OPTIONS.map((item) => `${item.value} (${item.label})`).join(", ")}.`,
    `Filas (queueId): ${workspace.queues.length ? workspace.queues.map((queue) => `${queue.id} (${queue.name})`).join(", ") : "nenhuma cadastrada"}.`,
    `Usuários (assigneeId/userIds): ${workspace.users.length ? workspace.users.slice(0, 60).map((user) => `${user.id} (${user.name})`).join(", ") : "nenhum"}.`,
    "",
    "Regras & Filtros (kind: op):",
    filters,
  ].join("\n");
}

const str = (value: unknown, max = 2000) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Só os parâmetros do tipo, com ids de fila/usuário e etapas conferidos contra o workspace. */
function configFor(type: NodeType, params: Params | null | undefined, filters: DraftFilters | undefined, workspace: BuilderWorkspace): Record<string, unknown> {
  const def = NODE_DEF[type];
  const queueIds = new Set(workspace.queues.map((queue) => queue.id));
  const userIds = new Set(workspace.users.map((user) => user.id));
  const config: Record<string, unknown> = { ...def.defaults };
  for (const field of def.fields) {
    const raw = params?.[field.key as keyof Params];
    if (raw === null || raw === undefined) continue;
    if (field.kind === "number") config[field.key] = Math.max(0, Number(raw) || 0);
    else if (field.kind === "boolean") config[field.key] = raw === true;
    else if (field.kind === "list") config[field.key] = (Array.isArray(raw) ? raw : []).map((item) => str(item, 80)).filter(Boolean).slice(0, 30);
    else if (field.kind === "stage") { if (STAGE_OPTIONS.some((item) => item.value === raw)) config[field.key] = raw; }
    else if (field.kind === "queue") config[field.key] = queueIds.has(String(raw)) ? String(raw) : "";
    else if (field.kind === "user") config[field.key] = userIds.has(String(raw)) ? String(raw) : "";
    else if (field.kind === "users") config[field.key] = (Array.isArray(raw) ? raw : []).map(String).filter((id) => userIds.has(id));
    else if (field.kind === "select") { if (field.options.some((option) => option.value === raw)) config[field.key] = raw; }
    else config[field.key] = str(raw);
  }
  if (typeof config.tag === "string") config.tag = config.tag.toLowerCase().replace(/\s+/g, "-");
  if (filters && Array.isArray(filters.rules) && filters.rules.length) {
    config.filters = {
      combinator: filters.combinator === "or" ? "or" : "and",
      onFail: filters.onFail === "stop" ? "stop" : "skip",
      rules: filters.rules.map((rule) => {
        const item = (rule ?? {}) as Record<string, unknown>;
        // Fila nos filtros só com id real.
        const value = item.kind === "queue" && item.value && !queueIds.has(String(item.value)) ? undefined : item.value;
        return { kind: item.kind, op: item.op, ...(typeof value === "string" && value.trim() ? { value: value.trim() } : {}) };
      }),
    };
  }
  return config;
}

const COLUMN_GAP = 300;
const ROW_GAP = 150;

/** Camadas a partir do gatilho (caminho mais longo) e colunas centradas por camada; ramos Sim à esquerda, Não à direita. */
export function layoutGraph(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const depth = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  // Passos sempre apontam para frente: relaxar as arestas na ordem dos nós basta.
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const edge of edges) {
      const next = (depth.get(edge.source) ?? 0) + 1;
      if (next > (depth.get(edge.target) ?? 0)) { depth.set(edge.target, next); changed = true; }
    }
    if (!changed) break;
  }
  const order = (node: FlowNode) => {
    const incoming = edges.find((edge) => edge.target === node.id);
    return incoming?.sourceHandle === "true" ? 0 : incoming?.sourceHandle === "false" ? 2 : 1;
  };
  const rows = new Map<number, FlowNode[]>();
  for (const node of nodes) rows.set(depth.get(node.id) ?? 0, [...(rows.get(depth.get(node.id) ?? 0) ?? []), node]);
  return nodes.map((node) => {
    const row = [...(rows.get(depth.get(node.id) ?? 0) ?? [])].sort((a, b) => order(a) - order(b));
    const index = row.findIndex((item) => item.id === node.id);
    const single = row.length === 1 ? order(node) - 1 : index - (row.length - 1) / 2;
    return { ...node, position: { x: Math.round(single * COLUMN_GAP), y: (depth.get(node.id) ?? 0) * ROW_GAP } };
  });
}

/** Rascunho da IA → grafo do editor. Erro quando não há gatilho válido ou nenhum passo conectado. */
export function draftToGraph(draft: AutomationDraft, workspace: BuilderWorkspace): { name: string; description: string; graph: FlowGraph } {
  const triggerType = draft.trigger?.type;
  if (!(TRIGGER_TYPES as readonly unknown[]).includes(triggerType)) throw new Error("A IA não definiu um gatilho válido. Descreva quando a automação deve começar.");
  const rawSteps = (Array.isArray(draft.steps) ? draft.steps : []) as DraftStep[];
  const steps = rawSteps.filter((step) => (ACTION_TYPES as readonly unknown[]).includes(step?.type)).slice(0, 40);
  if (!steps.length) throw new Error("A IA não gerou nenhum passo. Descreva o que deve acontecer depois do gatilho.");

  // Ids próprios (n1, n2...) para não colidir; mapa do id da IA para o nosso.
  const idOf = new Map<string, string>();
  steps.forEach((step, index) => { const key = str(step.id, 60) || `s${index + 1}`; if (!idOf.has(key)) idOf.set(key, `n${index + 1}`); });
  const indexOf = new Map(steps.map((step, index) => [idOf.get(str(step.id, 60) || `s${index + 1}`) ?? `n${index + 1}`, index]));

  const nodes: FlowNode[] = [
    { id: "trigger", type: triggerType as NodeType, position: { x: 0, y: 0 }, data: { config: configFor(triggerType as NodeType, draft.trigger?.params, draft.trigger?.filters, workspace) } },
    ...steps.map((step, index) => ({ id: `n${index + 1}`, type: step.type as NodeType, position: { x: 0, y: 0 }, data: { config: configFor(step.type as NodeType, step.params, step.filters, workspace) } })),
  ];
  const edges: FlowEdge[] = [{ id: "trigger-out-n1", source: "trigger", target: "n1", sourceHandle: null }];
  steps.forEach((step, index) => {
    const source = `n${index + 1}`;
    const link = (target: unknown, handle: "true" | "false" | null) => {
      const resolved = idOf.get(str(target, 60));
      // Só para frente: sem laços nem auto-conexão.
      if (!resolved || (indexOf.get(resolved) ?? -1) <= index) return;
      edges.push({ id: `${source}-${handle ?? "out"}-${resolved}`, source, target: resolved, sourceHandle: handle });
    };
    if (step.type === "condition") {
      link(step.nextTrue, "true");
      link(step.nextFalse, "false");
    } else {
      link(step.next, null);
    }
  });

  // Passos que ficaram soltos (sem entrada) não executariam: saem do fluxo.
  const reachable = new Set<string>(["trigger"]);
  for (let changed = true; changed;) {
    changed = false;
    for (const edge of edges) if (reachable.has(edge.source) && !reachable.has(edge.target)) { reachable.add(edge.target); changed = true; }
  }
  const graph = sanitizeGraph({ nodes: layoutGraph(nodes.filter((node) => reachable.has(node.id)), edges.filter((edge) => reachable.has(edge.source))), edges: edges.filter((edge) => reachable.has(edge.source)) });
  return {
    name: str(draft.name, 120) || "Automação criada com IA",
    description: str(draft.description, 300),
    graph,
  };
}
