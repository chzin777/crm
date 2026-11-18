import { CONVERSION_KINDS, MAX_AB_VARIANTS, readFlowSettings, readVariants, type FlowSettings, ACTION_TYPES, CONDITION_FIELDS, CONDITION_OPERATORS, FILTER_KINDS, NODE_DEF, NOTE_TARGETS, sanitizeGraph, STAGE_OPTIONS, TIME_UNITS, TRIGGER_TYPES, type FlowEdge, type FlowGraph, type FlowNode, type NodeType } from "@/lib/automations/nodes";

/**
 * Criação de automação com IA: o modelo devolve um rascunho (gatilho + passos) num JSON Schema estrito com
 * apenas os nós reais do motor; aqui o rascunho vira grafo validado, com posições calculadas para o canvas.
 * Puro: usado pela rota e pelos testes.
 */

export type BuilderWorkspace = { queues: { id: string; name: string }[]; users: { id: string; name: string }[]; flows?: { id: string; name: string }[] };

/** Parâmetros possíveis de qualquer nó (strict exige todos; o que não se aplica vem null). */
const PARAM_KEYS = {
  mode: { type: ["string", "null"], enum: ["any", "keywords", "settled", "end", "goto", null] },
  days: { type: ["array", "null"], items: { type: "integer" } },
  start: { type: ["string", "null"] },
  end: { type: ["string", "null"] },
  variants: { type: ["array", "null"], items: { type: "integer" } },
  flowId: { type: ["string", "null"] },
  customerType: { type: ["string", "null"], enum: ["any", "first", "repeat", null] },
  minAmount: { type: ["number", "null"] },
  store: { type: ["string", "null"] },
  category: { type: ["string", "null"] },
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
  field: { type: ["string", "null"], enum: [...CONDITION_FIELDS.map((item) => item.value), null] },
  variable: { type: ["string", "null"] },
  operator: { type: ["string", "null"], enum: [...CONDITION_OPERATORS.map((item) => item.value), null] },
  target: { type: ["string", "null"], enum: [...NOTE_TARGETS.map((item) => item.value), null] },
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
  cancelOnConversion: { type: "array", items: { type: "string", enum: CONVERSION_KINDS.map((item) => item.value) } },
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
      nextReplied: { type: ["string", "null"] },
      nextTimeout: { type: ["string", "null"] },
      nextVariants: { type: ["array", "null"], items: { type: ["string", "null"] } },
    }),
  },
});

type Params = Partial<Record<keyof typeof PARAM_KEYS, unknown>>;
type DraftFilters = { combinator?: unknown; onFail?: unknown; rules?: unknown } | null;
type DraftStep = { id?: unknown; type?: unknown; params?: Params | null; filters?: DraftFilters; next?: unknown; nextTrue?: unknown; nextFalse?: unknown; nextReplied?: unknown; nextTimeout?: unknown; nextVariants?: unknown };
export type AutomationDraft = { name?: unknown; description?: unknown; cancelOnConversion?: unknown; trigger?: { type?: unknown; params?: Params | null; filters?: DraftFilters } | null; steps?: unknown };

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
    "- wait_reply (Aguardar resposta do cliente): amount + unit (minutes, hours ou days) é o prazo; usa nextReplied (cliente respondeu no prazo) e nextTimeout (não respondeu); next é null. Use em follow-ups: \"se não responder em 1 dia, mande outra mensagem\" = send_whatsapp → wait_reply (amount 1, unit days) com nextTimeout no follow-up e nextReplied em ai_agent, assign ou null.",
    "- business_hours (Esperar até horário útil): days = dias da semana (0 = domingo ... 6 = sábado), start e end em HH:MM (horário de Brasília). Coloque ANTES de mensagens quando o pedido falar em horário comercial, não mandar de madrugada ou só em dias úteis (padrão Seg–Sáb, 08:00–18:00: days [1,2,3,4,5,6]).",
    "- ab_split (Teste A/B): variants = percentuais inteiros (2 a 5 variantes, soma exatamente 100, ex.: [50, 50] ou [70, 30]); nextVariants = lista com o id do primeiro passo de cada variante, na mesma ordem (Variante A, B...); next é null. Cada variante segue o seu próprio caminho (ex.: duas mensagens diferentes).",
    "- end_flow: mode end (encerra o fluxo) ou goto (vai para outra automação: flowId de uma automação listada); sem next. Use goto só quando o pedido citar uma automação existente.",
    "- cancelOnConversion (nível da automação): conversões que encerram a automação do contato: purchase (comprou no VMSet), paid (pagou/quitou título), won (oportunidade ganha). Em cadências de venda, recuperação de orçamento e reativação use [\"purchase\", \"won\"]; em cobrança use [\"paid\"]; senão [].",
    "- Nos demais tipos nextReplied, nextTimeout e nextVariants são null.",
    "- Ids curtos e únicos (ex.: s1, s2). Nunca aponte para um passo anterior (sem laços).",
    "- Tempo: amount + unit (seconds, minutes, hours, days, months, years). Mensagens de WhatsApp fora da janela de 24 h podem não ser entregues: em esperas longas prefira notificar a equipe.",
    "- Mensagens em português do Brasil, curtas e cordiais, com variáveis {{nome}}, {{cidade}}, {{telefone}} quando fizer sentido. Sem emojis em excesso.",
    "- trigger_message com mode keywords exige keywords; tags em minúsculas e com hífen (ex.: cliente-vip).",
    "- assign exige queueId de uma fila listada; assigneeId e userIds só com ids de usuários listados. Sem fila adequada, use notify.",
    "- Pipeline interno x ERP: gatilhos trigger_stage/trigger_tag reagem a movimentações DENTRO do CRM (Kanban, tags). Fatos comerciais e financeiros reais (compra, venda faturada, devolução, parcela vencida/a vencer, pagamento, aniversário, tempo sem comprar, óculos prontos no laboratório) vêm do ERP VMSet: use os gatilhos trigger_erp_*.",
    "- Ex.: \"NPS 5 minutos após a compra\" = trigger_erp_after_sale (amount 5, unit minutes, businessHours false), nunca trigger_stage. \"Cobrar quem está com parcela atrasada há 10 dias\" = trigger_erp_overdue (amount 10, unit days). \"Lembrar 3 dias antes do vencimento\" = trigger_erp_due_soon (amount 3). \"Parabéns no aniversário\" = trigger_erp_birthday (amount 0). \"Reativar quem não compra há 1 ano\" = trigger_erp_no_purchase (amount 1, unit years). \"Avisar que os óculos estão prontos\" = trigger_erp_lab_ready.",
    "- trigger_erp_sale/after_sale: customerType (any, first = primeira compra, repeat = recompra), minAmount em reais, store e category (texto contido). trigger_erp_paid: mode any ou settled (quitou o carnê). Variáveis do ERP nos textos: {{venda.valor}}, {{venda.numero}}, {{venda.loja}}, {{venda.itens}}, {{financeiro.valor_aberto}}, {{financeiro.dias_atraso}}, {{financeiro.vencimento}}, {{os.loja}}, {{cliente.idade}}.",
    "- WhatsApp livre só chega se o cliente falou nas últimas 24 h: para cobrança, aniversário e reativação, prefira notify/add_note/add_tag para a equipe agir (ou envie e deixe a equipe ciente).",
    "- condition: field (reply = resposta do cliente após o início; message = mensagem do gatilho; tag; stage; city; hour; variable = variável em params.variable), operator (equals, not_equals, contains, not_contains, exists, empty, gte, lt) e value.",
    "- add_note: target (opportunity, contact ou both) e text com a observação interna; pode usar {{contato.nome}} e {{mensagem.texto}}.",
    "- filters (Regras & Filtros) só quando o pedido restringir o público (ex.: só clientes, só uma cidade); senão null.",
    "- name: título curto da automação. description: uma frase do que ela faz.",
    "",
    `Etapas do funil (stage): ${STAGE_OPTIONS.map((item) => `${item.value} (${item.label})`).join(", ")}.`,
    `Filas (queueId): ${workspace.queues.length ? workspace.queues.map((queue) => `${queue.id} (${queue.name})`).join(", ") : "nenhuma cadastrada"}.`,
    `Usuários (assigneeId/userIds): ${workspace.users.length ? workspace.users.slice(0, 60).map((user) => `${user.id} (${user.name})`).join(", ") : "nenhum"}.`,
    `Automações existentes (flowId do end_flow goto): ${workspace.flows?.length ? workspace.flows.slice(0, 60).map((flow) => `${flow.id} (${flow.name})`).join(", ") : "nenhuma"}.`,
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
    else if (field.kind === "weekdays") config[field.key] = [...new Set((Array.isArray(raw) ? raw : []).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
    else if (field.kind === "time") { if (/^\d{2}:\d{2}$/.test(String(raw))) config[field.key] = String(raw); }
    else if (field.kind === "variants") config[field.key] = (Array.isArray(raw) ? raw : []).map((item) => Math.max(0, Math.min(100, Math.round(Number(item) || 0)))).slice(0, MAX_AB_VARIANTS);
    else if (field.kind === "flow") config[field.key] = workspace.flows?.some((flow) => flow.id === String(raw)) ? String(raw) : "";
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
    const handle = incoming?.sourceHandle ?? "";
    if (handle === "true" || handle === "replied") return 0;
    if (handle === "false" || handle === "timeout") return 2;
    const variant = /^v(\d)$/.exec(handle);
    return variant ? Math.min(2, Number(variant[1]) * 2) : 1;
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
export function draftToGraph(draft: AutomationDraft, workspace: BuilderWorkspace): { name: string; description: string; graph: FlowGraph; settings: FlowSettings } {
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
    const link = (target: unknown, handle: string | null) => {
      const resolved = idOf.get(str(target, 60));
      // Só para frente: sem laços nem auto-conexão.
      if (!resolved || (indexOf.get(resolved) ?? -1) <= index) return;
      edges.push({ id: `${source}-${handle ?? "out"}-${resolved}`, source, target: resolved, sourceHandle: handle });
    };
    if (step.type === "condition") {
      link(step.nextTrue, "true");
      link(step.nextFalse, "false");
    } else if (step.type === "wait_reply") {
      link(step.nextReplied, "replied");
      link(step.nextTimeout, "timeout");
    } else if (step.type === "ab_split") {
      const variants = readVariants(nodes[index + 1].data.config);
      (Array.isArray(step.nextVariants) ? step.nextVariants : []).slice(0, variants.length).forEach((target, position) => link(target, `v${position}`));
    } else if (step.type === "end_flow") {
      // Encerra: sem próximo passo.
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
    settings: readFlowSettings({ cancelOnConversion: draft.cancelOnConversion }),
  };
}
