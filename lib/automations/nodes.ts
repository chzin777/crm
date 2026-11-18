/**
 * Catálogo dos nós do construtor de automações (/automacoes). Puro: usado pela tela, pelo motor e pelos testes.
 */

/** Gatilhos do ERP VMSet: vendas (espelho do ERP, ~1 min), financeiro e laboratório (consulta ao Oracle) e ciclo de vida. */
export const ERP_TRIGGER_TYPES = [
  "trigger_erp_sale", "trigger_erp_after_sale", "trigger_erp_return",
  "trigger_erp_overdue", "trigger_erp_good_payer", "trigger_erp_due_soon", "trigger_erp_paid",
  "trigger_erp_birthday", "trigger_erp_no_purchase", "trigger_erp_lab_ready",
] as const;
export const TRIGGER_TYPES = ["trigger_message", "trigger_stage", "trigger_tag", "trigger_inactive", "trigger_webhook", "trigger_ai_handoff", ...ERP_TRIGGER_TYPES] as const;
export type ErpTriggerType = (typeof ERP_TRIGGER_TYPES)[number];
export const isErpTrigger = (type: string): type is ErpTriggerType => (ERP_TRIGGER_TYPES as readonly string[]).includes(type);
export const ACTION_TYPES = ["send_whatsapp", "delay", "ai_agent", "move_stage", "create_opportunity", "add_tag", "remove_tag", "assign", "notify", "add_note", "opt_out", "condition", "http"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];
export type NodeType = TriggerType | (typeof ACTION_TYPES)[number];
export type NodeCategory = "gatilho_crm" | "gatilho_whatsapp" | "erp_vendas" | "erp_financeiro" | "mensagem" | "ia" | "crm" | "logica";

export const NODE_CATEGORIES: { id: NodeCategory; label: string }[] = [
  { id: "gatilho_crm", label: "Gatilhos · CRM & Pipeline" },
  { id: "gatilho_whatsapp", label: "Gatilhos · WhatsApp & Atendimento" },
  { id: "erp_vendas", label: "Gatilhos · ERP VMSet — Vendas" },
  { id: "erp_financeiro", label: "Gatilhos · ERP VMSet — Financeiro & Ciclo de Vida" },
  { id: "mensagem", label: "Mensagens & Tempo" },
  { id: "ia", label: "Inteligência Artificial" },
  { id: "crm", label: "CRM & Funil" },
  { id: "logica", label: "Lógica & Webhooks" },
];

export type FieldDef =
  | { key: string; label: string; kind: "text" | "textarea" | "number" | "url" | "audio"; placeholder?: string; hint?: string }
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[]; hint?: string }
  | { key: string; label: string; kind: "boolean"; hint?: string }
  | { key: string; label: string; kind: "list"; placeholder?: string; hint?: string }
  | { key: string; label: string; kind: "stage" | "queue" | "user" | "users"; hint?: string };

/** Áudio enviado pelo editor (upload no armazenamento): o valor do campo é "storage:<chave>"; URL http(s) também vale. */
export const AUDIO_STORAGE_PREFIX = "storage:";

/** Presença antes do envio: automática (tamanho do texto / duração do áudio), tempo fixo ou desligada. */
export const PRESENCE_MODE_OPTIONS = [
  { value: "auto", label: "Automático (pelo texto / duração do áudio)" },
  { value: "custom", label: "Tempo fixo (segundos)" },
  { value: "off", label: "Desligado (envia na hora)" },
];

export type NodeDef = { type: NodeType; category: NodeCategory; label: string; description: string; fields: FieldDef[]; defaults: Record<string, unknown> };

export const STAGE_OPTIONS = [
  { value: "novo-lead", label: "Novo lead" },
  { value: "em-atendimento", label: "Em atendimento" },
  { value: "fechamento", label: "Fechamento" },
  { value: "ganho", label: "Ganho" },
  { value: "pos-venda", label: "Pós-venda" },
  { value: "recompra", label: "Recompra" },
  { value: "reativacao", label: "Reativação" },
];

// ---------------------------------------------------------------- Tempo (segundos a anos)

export const TIME_UNITS = ["seconds", "minutes", "hours", "days", "months", "years"] as const;
export type TimeUnit = (typeof TIME_UNITS)[number];
export const TIME_UNIT_OPTIONS: { value: TimeUnit; label: string }[] = [
  { value: "seconds", label: "Segundos" },
  { value: "minutes", label: "Minutos" },
  { value: "hours", label: "Horas" },
  { value: "days", label: "Dias" },
  { value: "months", label: "Meses" },
  { value: "years", label: "Anos" },
];
const UNIT_SHORT: Record<TimeUnit, [string, string]> = { seconds: ["segundo", "segundos"], minutes: ["minuto", "minutos"], hours: ["hora", "horas"], days: ["dia", "dias"], months: ["mês", "meses"], years: ["ano", "anos"] };
const FIXED_MS: Record<Exclude<TimeUnit, "months" | "years">, number> = { seconds: 1000, minutes: 60_000, hours: 3_600_000, days: 86_400_000 };
/** Limite de segurança: nenhuma espera ou janela de inatividade passa de 10 anos. */
export const MAX_DURATION_YEARS = 10;

export const isTimeUnit = (value: unknown): value is TimeUnit => (TIME_UNITS as readonly unknown[]).includes(value);

/** Quantidade + unidade do nó, com retrocompatibilidade: nó antigo salvo só com `days` vira { days, "days" }. */
export function readDuration(config: Record<string, unknown>, fallbackUnit: TimeUnit = "hours"): { amount: number; unit: TimeUnit } {
  const legacyDays = config.amount === undefined && config.days !== undefined;
  const amount = Math.max(0, Number(legacyDays ? config.days : config.amount) || 0);
  const unit = legacyDays ? "days" : isTimeUnit(config.unit) ? config.unit : fallbackUnit;
  return { amount, unit };
}

/**
 * Soma (sign 1) ou subtrai (sign -1) a duração. Meses e anos seguem o calendário (31/01 + 1 mês = 28 ou 29/02);
 * segundos a dias são fixos. Frações de mês/ano usam 30 e 365 dias.
 */
export function shiftDate(date: Date, amount: number, unit: TimeUnit, sign: 1 | -1 = 1): Date {
  const value = Math.max(0, Number(amount) || 0);
  const limit = MAX_DURATION_YEARS * 365 * FIXED_MS.days;
  if (unit === "months" || unit === "years") {
    const months = Math.trunc(value) * (unit === "years" ? 12 : 1);
    const fraction = (value - Math.trunc(value)) * (unit === "years" ? 365 : 30) * FIXED_MS.days;
    const result = new Date(date.getTime());
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + sign * months);
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
    const shifted = result.getTime() + sign * fraction;
    return new Date(Math.abs(shifted - date.getTime()) > limit ? date.getTime() + sign * limit : shifted);
  }
  return new Date(date.getTime() + sign * Math.min(value * FIXED_MS[unit], limit));
}

export function durationLabel(amount: number, unit: TimeUnit): string {
  const [one, many] = UNIT_SHORT[unit];
  return `${amount.toLocaleString("pt-BR")} ${amount === 1 ? one : many}`;
}

// ---------------------------------------------------------------- Regras & filtros de execução

export type FilterKind = "queue" | "contact_type" | "stage" | "tag" | "city" | "prescription";
/**
 * queue: any | none | in | not_in · contact_type: lead | customer | all · stage: in | not_in · tag: has | not_has ·
 * city: equals | empty · prescription: yes | no. value: fila, etapa, tag ou cidade quando o operador pede.
 */
export type FilterRule = { kind: FilterKind; op: string; value?: string };
/** combinator: todas (E) ou qualquer (OU). onFail (ações): pular o passo e seguir, ou encerrar o ramo. */
export type NodeFilters = { combinator: "and" | "or"; rules: FilterRule[]; onFail: "skip" | "stop" };

export const FILTER_KINDS: { kind: FilterKind; label: string; ops: { value: string; label: string; needsValue?: "queue" | "stage" | "text" }[] }[] = [
  { kind: "queue", label: "Fila de atendimento", ops: [{ value: "any", label: "Qualquer fila" }, { value: "none", label: "Sem nenhuma fila" }, { value: "in", label: "Está na fila", needsValue: "queue" }, { value: "not_in", label: "Não está na fila", needsValue: "queue" }] },
  { kind: "contact_type", label: "Tipo de contato", ops: [{ value: "lead", label: "Apenas leads (sem compra)" }, { value: "customer", label: "Apenas clientes recorrentes (com compra)" }, { value: "all", label: "Todos" }] },
  { kind: "stage", label: "Etapa do funil", ops: [{ value: "in", label: "Está na etapa", needsValue: "stage" }, { value: "not_in", label: "Não está na etapa", needsValue: "stage" }] },
  { kind: "tag", label: "Tags do contato", ops: [{ value: "has", label: "Possui a tag", needsValue: "text" }, { value: "not_has", label: "Não possui a tag", needsValue: "text" }] },
  { kind: "city", label: "Cidade / região", ops: [{ value: "equals", label: "Cidade igual a", needsValue: "text" }, { value: "empty", label: "Cidade vazia" }] },
  { kind: "prescription", label: "Receita cadastrada", ops: [{ value: "yes", label: "Possui receita" }, { value: "no", label: "Não possui receita" }] },
];
const FILTER_KIND = Object.fromEntries(FILTER_KINDS.map((item) => [item.kind, item])) as Record<FilterKind, (typeof FILTER_KINDS)[number]>;

export const EMPTY_FILTERS: NodeFilters = { combinator: "and", rules: [], onFail: "skip" };

/** Lê os filtros salvos no nó (config.filters), descartando regras inválidas. */
export function readFilters(config: Record<string, unknown>): NodeFilters {
  const raw = (config.filters && typeof config.filters === "object" ? config.filters : {}) as Record<string, unknown>;
  const rules = (Array.isArray(raw.rules) ? raw.rules : [])
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : {}))
    .filter((item) => typeof item.kind === "string" && item.kind in FILTER_KIND && FILTER_KIND[item.kind as FilterKind].ops.some((op) => op.value === item.op))
    .map((item) => ({ kind: item.kind, op: item.op, ...(typeof item.value === "string" ? { value: item.value.slice(0, 120) } : {}) }) as FilterRule)
    .slice(0, 20);
  return { combinator: raw.combinator === "or" ? "or" : "and", rules, onFail: raw.onFail === "stop" ? "stop" : "skip" };
}

/** Dados do contato que as regras e as condições consultam. */
export type ContactFacts = {
  tags: string[];
  stage: string | null;
  city: string | null;
  /** Fila da conversa (null = sem fila). */
  queueId?: string | null;
  /** Cliente recorrente (compra no VMSet/ERP ou venda ganha). null = não consultado. */
  isCustomer?: boolean | null;
  hasPrescription?: boolean;
};

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function ruleMatches(rule: FilterRule, facts: ContactFacts): boolean {
  const value = plain(rule.value ?? "");
  switch (rule.kind) {
    case "queue": {
      const queue = facts.queueId ?? null;
      if (rule.op === "any") return true;
      if (rule.op === "none") return queue === null;
      if (rule.op === "in") return !!value && queue !== null && plain(queue) === value;
      return queue === null || plain(queue) !== value;
    }
    case "contact_type":
      if (rule.op === "all") return true;
      return rule.op === "customer" ? facts.isCustomer === true : facts.isCustomer !== true;
    case "stage": {
      const inStage = !!facts.stage && plain(facts.stage) === value;
      return rule.op === "in" ? inStage : !inStage;
    }
    case "tag": {
      const has = facts.tags.some((tag) => plain(tag) === value);
      return rule.op === "has" ? has : !has;
    }
    case "city":
      return rule.op === "empty" ? !plain(facts.city ?? "") : !!value && plain(facts.city ?? "") === value;
    case "prescription":
      return rule.op === "yes" ? facts.hasPrescription === true : facts.hasPrescription !== true;
    default:
      return true;
  }
}

/** Sem regras: passa. Com regras: todas (E) ou qualquer (OU). */
export function evaluateFilters(filters: NodeFilters, facts: ContactFacts): boolean {
  if (!filters.rules.length) return true;
  return filters.combinator === "or" ? filters.rules.some((rule) => ruleMatches(rule, facts)) : filters.rules.every((rule) => ruleMatches(rule, facts));
}

/** Texto curto de uma regra para log e para o cartão do nó. */
export function describeRule(rule: FilterRule, names: { queues?: Record<string, string> } = {}): string {
  const def = FILTER_KIND[rule.kind];
  const op = def.ops.find((item) => item.value === rule.op);
  const value = rule.kind === "queue" ? names.queues?.[rule.value ?? ""] ?? rule.value : rule.kind === "stage" ? STAGE_OPTIONS.find((item) => item.value === rule.value)?.label ?? rule.value : rule.value;
  return `${op?.label ?? rule.op}${op?.needsValue && value ? ` "${value}"` : ""}`;
}

export function describeFilters(filters: NodeFilters, names: { queues?: Record<string, string> } = {}): string {
  return filters.rules.map((rule) => describeRule(rule, names)).join(filters.combinator === "or" ? " OU " : " E ");
}

// ---------------------------------------------------------------- Condição (se / senão)

export type ConditionField = "none" | "reply" | "message" | "tag" | "stage" | "city" | "hour" | "variable";
export type ConditionOperator = "equals" | "not_equals" | "contains" | "not_contains" | "exists" | "empty" | "gte" | "lt";
/** Campos que a condição verifica; "variable" lê qualquer variável da execução (campos do webhook, {{fila}}...). */
export const CONDITION_FIELDS: { value: ConditionField; label: string; short: string }[] = [
  { value: "reply", label: "Resposta do cliente (após o início)", short: "Resposta do cliente" },
  { value: "message", label: "Mensagem recebida (gatilho)", short: "Mensagem recebida" },
  { value: "tag", label: "Tag da conversa", short: "Tag" },
  { value: "stage", label: "Etapa do funil", short: "Etapa" },
  { value: "city", label: "Cidade do contato", short: "Cidade" },
  { value: "hour", label: "Hora atual (0 a 23)", short: "Hora" },
  { value: "variable", label: "Variável / campo personalizado", short: "Variável" },
  { value: "none", label: "Só as Regras & Filtros", short: "Regras & Filtros" },
];
export const CONDITION_OPERATORS: { value: ConditionOperator; label: string; symbol: string; needsValue: boolean; numeric?: boolean }[] = [
  { value: "equals", label: "É igual a", symbol: "=", needsValue: true },
  { value: "not_equals", label: "É diferente de", symbol: "≠", needsValue: true },
  { value: "contains", label: "Contém", symbol: "contém", needsValue: true },
  { value: "not_contains", label: "Não contém", symbol: "não contém", needsValue: true },
  { value: "exists", label: "Está preenchido / respondeu", symbol: "está preenchido", needsValue: false },
  { value: "empty", label: "Está vazio / não respondeu", symbol: "está vazio", needsValue: false },
  { value: "gte", label: "Maior ou igual a", symbol: "≥", needsValue: true, numeric: true },
  { value: "lt", label: "Menor que", symbol: "<", needsValue: true, numeric: true },
];

/** Operadores que fazem sentido para o campo (hora: só comparação numérica). */
export function operatorsFor(field: string) {
  if (field === "hour") return CONDITION_OPERATORS.filter((item) => ["equals", "not_equals", "gte", "lt"].includes(item.value));
  return CONDITION_OPERATORS.filter((item) => !item.numeric || field === "variable");
}

/** Resumo legível da condição para o cartão do nó: Tag contém "vip", Etapa = "Fechamento". */
export function describeCondition(config: Record<string, unknown>): string {
  const field = CONDITION_FIELDS.find((item) => item.value === config.field) ?? CONDITION_FIELDS[0];
  if (field.value === "none") return "Só as Regras & Filtros do nó";
  const operator = CONDITION_OPERATORS.find((item) => item.value === config.operator) ?? CONDITION_OPERATORS[4];
  const subject = field.value === "variable" ? `{{${String(config.variable ?? "").trim() || "variável"}}}` : field.short;
  const raw = String(config.value ?? "").trim();
  // "exists" com valor (fluxos antigos) funciona como "contém".
  if (operator.value === "exists" && raw) return `${subject} contém "${raw}"`;
  if (!operator.needsValue) return `${subject} ${operator.symbol}`;
  const value = field.value === "stage" ? STAGE_OPTIONS.find((item) => item.value === raw)?.label ?? raw : field.value === "hour" && raw ? `${raw}h` : raw;
  return `${subject} ${operator.symbol} ${value ? `"${value}"` : "(defina o valor)"}`;
}

// ---------------------------------------------------------------- Adicionar observação

export type NoteTarget = "opportunity" | "contact" | "both";
export const NOTE_TARGETS: { value: NoteTarget; label: string }[] = [
  { value: "opportunity", label: "Oportunidade / card do pipeline" },
  { value: "contact", label: "Cadastro do contato / cliente" },
  { value: "both", label: "Ambos" },
];
const NOTE_HINT = "Variáveis: {{contato.nome}}, {{contato.cidade}}, {{contato.telefone}}, {{mensagem.texto}}, {{fila}}, {{motivo}} e campos do webhook. Sem oportunidade aberta, a nota vai para o cadastro do contato.";

// ---------------------------------------------------------------- Catálogo

const DURATION_FIELDS = (amountLabel: string): FieldDef[] => [
  { key: "amount", label: amountLabel, kind: "number" },
  { key: "unit", label: "Unidade", kind: "select", options: TIME_UNIT_OPTIONS },
];

const DAY_UNIT_OPTIONS = TIME_UNIT_OPTIONS.filter((item) => item.value === "days" || item.value === "months" || item.value === "years");
const DAY_DURATION_FIELDS = (amountLabel: string): FieldDef[] => [
  { key: "amount", label: amountLabel, kind: "number" },
  { key: "unit", label: "Unidade", kind: "select", options: DAY_UNIT_OPTIONS },
];
const SALE_FILTER_FIELDS: FieldDef[] = [
  { key: "customerType", label: "Tipo de cliente", kind: "select", options: [{ value: "any", label: "Qualquer cliente" }, { value: "first", label: "Primeira compra" }, { value: "repeat", label: "Recompra (cliente recorrente)" }] },
  { key: "minAmount", label: "Valor mínimo da venda (R$)", kind: "number", hint: "0 = qualquer valor." },
  { key: "store", label: "Loja / filial (contém)", kind: "text", placeholder: "vazio = todas" },
  { key: "category", label: "Categoria ou produto (contém)", kind: "text", placeholder: "lente, armação, solar..." },
];
const SALE_DEFAULTS = { customerType: "any", minAmount: 0, store: "", category: "" };
const SALE_VARS = "Variáveis: {{venda.numero}}, {{venda.valor}}, {{venda.loja}}, {{venda.data}}, {{venda.itens}}, {{venda.vendedor}}, {{venda.tipo_cliente}}.";
const FIN_VARS = "Variáveis: {{financeiro.titulo}}, {{financeiro.parcela}}, {{financeiro.vencimento}}, {{financeiro.valor_aberto}}, {{financeiro.dias_atraso}}, {{financeiro.loja}}.";

/** Rótulos dos gatilhos do ERP com as variáveis que cada um entrega (painel e prompt da IA). */
export const ERP_TRIGGER_VARIABLES: Record<ErpTriggerType, string[]> = {
  trigger_erp_sale: ["venda.numero", "venda.valor", "venda.loja", "venda.data", "venda.itens", "venda.vendedor", "venda.tipo_cliente"],
  trigger_erp_after_sale: ["venda.numero", "venda.valor", "venda.loja", "venda.data", "venda.itens", "venda.vendedor", "venda.tipo_cliente"],
  trigger_erp_return: ["venda.numero", "venda.valor", "venda.loja", "venda.data", "venda.itens"],
  trigger_erp_overdue: ["financeiro.titulo", "financeiro.parcela", "financeiro.vencimento", "financeiro.valor_aberto", "financeiro.dias_atraso", "financeiro.loja"],
  trigger_erp_due_soon: ["financeiro.titulo", "financeiro.parcela", "financeiro.vencimento", "financeiro.valor_aberto", "financeiro.dias_para_vencer", "financeiro.loja"],
  trigger_erp_paid: ["financeiro.titulo", "financeiro.parcela", "financeiro.valor_pago", "financeiro.data_pagamento", "financeiro.parcelas_restantes", "financeiro.loja"],
  trigger_erp_good_payer: ["financeiro.data_pagamento", "financeiro.valor_pago", "financeiro.loja"],
  trigger_erp_birthday: ["cliente.aniversario", "cliente.idade"],
  trigger_erp_no_purchase: ["cliente.ultima_compra", "cliente.dias_sem_comprar"],
  trigger_erp_lab_ready: ["os.numero", "os.protocolo", "os.loja", "os.data_pronta"],
};

export const NODE_DEFS: NodeDef[] = [
  { type: "trigger_erp_sale", category: "erp_vendas", label: "Venda concluída / faturada", description: `Nova venda detectada no VMSet (espelho atualizado a cada minuto). ${SALE_VARS}`, fields: SALE_FILTER_FIELDS, defaults: SALE_DEFAULTS },
  { type: "trigger_erp_after_sale", category: "erp_vendas", label: "Tempo após a venda", description: `Minutos a anos depois de uma venda no VMSet: NPS, adaptação das lentes, recompra, renovação. ${SALE_VARS}`, fields: [...DURATION_FIELDS("Quanto tempo depois"), { key: "businessHours", label: "Disparar só em horário comercial", kind: "boolean" }, ...SALE_FILTER_FIELDS], defaults: { amount: 7, unit: "days", businessHours: true, ...SALE_DEFAULTS } },
  { type: "trigger_erp_return", category: "erp_vendas", label: "Venda devolvida", description: `Devolução de venda lançada no VMSet. ${SALE_VARS}`, fields: SALE_FILTER_FIELDS.filter((field) => field.key !== "customerType"), defaults: { minAmount: 0, store: "", category: "" } },

  { type: "trigger_erp_overdue", category: "erp_financeiro", label: "Cliente inadimplente há X", description: `Parcela do crediário/carnê vencida há exatamente X dias (ou meses) e ainda em aberto. Uma vez por parcela. ${FIN_VARS}`, fields: [...DAY_DURATION_FIELDS("Vencida há"), { key: "minAmount", label: "Valor mínimo da parcela (R$)", kind: "number" }, { key: "store", label: "Loja / filial (contém)", kind: "text", placeholder: "vazio = todas" }], defaults: { amount: 5, unit: "days", minAmount: 0, store: "" } },
  { type: "trigger_erp_due_soon", category: "erp_financeiro", label: "Parcela prestes a vencer", description: `Parcela em aberto que vence daqui a X dias (lembrete preventivo). ${FIN_VARS}`, fields: [{ key: "amount", label: "Dias antes do vencimento", kind: "number", hint: "0 = no dia do vencimento." }, { key: "minAmount", label: "Valor mínimo da parcela (R$)", kind: "number" }, { key: "store", label: "Loja / filial (contém)", kind: "text", placeholder: "vazio = todas" }], defaults: { amount: 3, minAmount: 0, store: "" } },
  { type: "trigger_erp_paid", category: "erp_financeiro", label: "Pagamento identificado", description: "Baixa de parcela no VMSet (ou quitação do carnê inteiro). Variáveis: {{financeiro.valor_pago}}, {{financeiro.data_pagamento}}, {{financeiro.parcelas_restantes}}, {{financeiro.titulo}}.", fields: [{ key: "mode", label: "Quando", kind: "select", options: [{ value: "any", label: "Qualquer parcela paga" }, { value: "settled", label: "Quitou o carnê / crediário inteiro" }] }, { key: "minAmount", label: "Valor mínimo pago (R$)", kind: "number" }], defaults: { mode: "any", minAmount: 0 } },
  { type: "trigger_erp_good_payer", category: "erp_financeiro", label: "Cliente adimplente há X", description: "X depois de pagar uma parcela em dia, sem nenhuma parcela vencida em aberto: campanhas VIP, limite de crédito, fidelidade.", fields: DAY_DURATION_FIELDS("Pagando em dia há"), defaults: { amount: 6, unit: "months" } },
  { type: "trigger_erp_birthday", category: "erp_financeiro", label: "Aniversário do cliente", description: "Data de nascimento do cadastro (VMSet): no dia ou X dias antes. Variáveis: {{cliente.aniversario}}, {{cliente.idade}}.", fields: [{ key: "amount", label: "Dias antes", kind: "number", hint: "0 = no dia do aniversário." }], defaults: { amount: 0 } },
  { type: "trigger_erp_no_purchase", category: "erp_financeiro", label: "Cliente sem comprar há X", description: "Última compra no VMSet foi há exatamente X dias, meses ou anos (reativação de base). Variáveis: {{cliente.ultima_compra}}, {{cliente.dias_sem_comprar}}.", fields: DAY_DURATION_FIELDS("Sem comprar há"), defaults: { amount: 12, unit: "months" } },
  { type: "trigger_erp_lab_ready", category: "erp_financeiro", label: "OS pronta para retirada", description: "Laboratório concluiu a produção dos óculos (OS) e o cliente ainda não retirou. Variáveis: {{os.numero}}, {{os.protocolo}}, {{os.loja}}, {{os.data_pronta}}.", fields: [{ key: "store", label: "Loja / filial (contém)", kind: "text", placeholder: "vazio = todas" }], defaults: { store: "" } },

  { type: "trigger_message", category: "gatilho_whatsapp", label: "Mensagem recebida", description: "Cliente mandou mensagem no WhatsApp (qualquer uma ou com palavra-chave).", fields: [{ key: "mode", label: "Quando", kind: "select", options: [{ value: "any", label: "Qualquer mensagem" }, { value: "keywords", label: "Contém palavra-chave" }] }, { key: "keywords", label: "Palavras-chave / intenção", kind: "list", placeholder: "orçamento, preço, receita" }], defaults: { mode: "keywords", keywords: [] } },
  { type: "trigger_stage", category: "gatilho_crm", label: "Lead entrou na etapa", description: "Oportunidade entrou numa etapa do funil (Kanban, IA ou atendimento).", fields: [{ key: "stage", label: "Etapa", kind: "stage" }], defaults: { stage: "em-atendimento" } },
  { type: "trigger_tag", category: "gatilho_crm", label: "Tag adicionada", description: "Uma tag foi aplicada na conversa do contato.", fields: [{ key: "tag", label: "Tag", kind: "text", placeholder: "vip" }], defaults: { tag: "" } },
  { type: "trigger_inactive", category: "gatilho_whatsapp", label: "Cliente inativo por tempo", description: "Contato sem mandar mensagem há um tempo (segundos a anos).", fields: [...DURATION_FIELDS("Tempo sem contato"), { key: "businessHours", label: "Disparar só em horário comercial", kind: "boolean" }], defaults: { amount: 90, unit: "days", businessHours: false } },
  { type: "trigger_webhook", category: "gatilho_crm", label: "Webhook externo", description: "Sistema externo chama a URL do fluxo com { telefone } e variáveis.", fields: [], defaults: {} },
  { type: "trigger_ai_handoff", category: "gatilho_whatsapp", label: "IA transferiu o atendimento", description: "A IA passou a conversa para a equipe (já na fila escolhida pelo assunto). Variáveis: {{fila}} e {{motivo}}.", fields: [{ key: "queueId", label: "Só quando a fila escolhida for (vazio = qualquer)", kind: "queue" }], defaults: { queueId: "" } },

  { type: "send_whatsapp", category: "mensagem", label: "Enviar WhatsApp", description: "Texto com variáveis, imagem e nota de voz opcionais, com digitando/gravando antes de cada bloco (janela de 24 h aberta).", fields: [{ key: "text", label: "Mensagem", kind: "textarea", placeholder: "Oi {{nome}}, tudo bem?", hint: "Variáveis: {{nome}}, {{nome_completo}}, {{cidade}}, {{telefone}} e campos do webhook." }, { key: "mediaUrl", label: "URL da imagem (opcional)", kind: "url", placeholder: "https://..." }, { key: "audio", label: "Nota de voz (opcional)", kind: "audio", placeholder: "https://.../audio.mp3", hint: "Envie .mp3, .ogg ou .opus (ou cole a URL): chega como áudio gravado na hora, depois da mensagem." }, { key: "presenceMode", label: "Digitando / gravando antes do envio", kind: "select", options: PRESENCE_MODE_OPTIONS }, { key: "presenceSeconds", label: "Tempo de digitando/gravando (segundos)", kind: "number", hint: "De 0 a 20 s, aplicado a cada bloco (texto e áudio)." }], defaults: { text: "", mediaUrl: "", audio: "", presenceMode: "auto", presenceSeconds: 5 } },
  { type: "delay", category: "mensagem", label: "Aguardar", description: "Pausa o fluxo de segundos até anos.", fields: [...DURATION_FIELDS("Quanto tempo"), { key: "businessHours", label: "Retomar só em horário comercial", kind: "boolean" }], defaults: { amount: 1, unit: "hours", businessHours: false } },
  { type: "ai_agent", category: "ia", label: "Acionar agente de IA", description: "Passa o atendimento para a IA com um objetivo.", fields: [{ key: "objective", label: "Objetivo da IA", kind: "textarea", placeholder: "Qualificar cidade e faixa de preço" }], defaults: { objective: "" } },

  { type: "move_stage", category: "crm", label: "Mover etapa no pipeline", description: "Move a oportunidade do contato para outra etapa.", fields: [{ key: "stage", label: "Etapa", kind: "stage" }], defaults: { stage: "em-atendimento" } },
  { type: "create_opportunity", category: "crm", label: "Criar oportunidade", description: "Abre a oportunidade do contato em Novo lead (se não houver aberta).", fields: [], defaults: {} },
  { type: "add_tag", category: "crm", label: "Adicionar tag", description: "Aplica uma tag na conversa do contato.", fields: [{ key: "tag", label: "Tag", kind: "text" }], defaults: { tag: "" } },
  { type: "remove_tag", category: "crm", label: "Remover tag", description: "Tira uma tag da conversa do contato.", fields: [{ key: "tag", label: "Tag", kind: "text" }], defaults: { tag: "" } },
  { type: "assign", category: "crm", label: "Atribuir atendente / fila", description: "Coloca a conversa numa fila e, se quiser, com um atendente.", fields: [{ key: "queueId", label: "Fila", kind: "queue" }, { key: "assigneeId", label: "Atendente (opcional)", kind: "user" }], defaults: { queueId: "", assigneeId: "" } },
  { type: "notify", category: "crm", label: "Notificar usuário / equipe", description: "Notificação interna no CRM e alerta opcional no WhatsApp.", fields: [{ key: "userIds", label: "Usuários (vazio = supervisores)", kind: "users" }, { key: "title", label: "Título", kind: "text" }, { key: "message", label: "Mensagem", kind: "textarea" }, { key: "whatsappPhone", label: "Alerta no WhatsApp (telefone, opcional)", kind: "text", placeholder: "62999990000" }], defaults: { userIds: [], title: "Automação: {{nome}}", message: "", whatsappPhone: "" } },
  { type: "add_note", category: "crm", label: "Adicionar observação", description: "Registra uma nota interna na oportunidade do funil e/ou no cadastro do contato.", fields: [{ key: "target", label: "Destino", kind: "select", options: NOTE_TARGETS }, { key: "text", label: "Texto da observação", kind: "textarea", placeholder: "Cliente pediu orçamento de {{mensagem.texto}}", hint: NOTE_HINT }], defaults: { target: "opportunity", text: "" } },
  { type: "opt_out", category: "crm", label: "Marcar opt-out", description: "Tira o contato de campanhas (LGPD) e encerra as automações dele.", fields: [], defaults: {} },

  { type: "condition", category: "logica", label: "Condição (se / senão)", description: "Segue pelo caminho Sim quando a verificação (e as Regras & Filtros, se houver) é atendida; senão, pelo caminho Não.", fields: [{ key: "field", label: "Campo / variável", kind: "select", options: CONDITION_FIELDS.map(({ value, label }) => ({ value, label })) }, { key: "variable", label: "Nome da variável", kind: "text", placeholder: "origem" }, { key: "operator", label: "Operador", kind: "select", options: CONDITION_OPERATORS.map(({ value, label }) => ({ value, label })) }, { key: "value", label: "Valor", kind: "text" }], defaults: { field: "reply", operator: "exists", value: "" } },
  { type: "http", category: "logica", label: "Requisição HTTP", description: "Chama uma URL externa (GET/POST); a resposta vira variável {{http.campo}}.", fields: [{ key: "method", label: "Método", kind: "select", options: [{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }] }, { key: "url", label: "URL", kind: "url", placeholder: "https://..." }, { key: "body", label: "Corpo JSON (POST)", kind: "textarea", placeholder: "{\"telefone\": \"{{telefone}}\"}" }], defaults: { method: "POST", url: "", body: "" } },
];

export const NODE_DEF = Object.fromEntries(NODE_DEFS.map((def) => [def.type, def])) as Record<NodeType, NodeDef>;
export const isTrigger = (type: string): type is TriggerType => (TRIGGER_TYPES as readonly string[]).includes(type);

/** dir "LR": nó com entradas à esquerda e saídas à direita (auto-organizar horizontal). */
export type FlowNode = { id: string; type: NodeType; position: { x: number; y: number }; data: { config: Record<string, unknown>; dir?: "LR" } };
/** sourceHandle "true"/"false" só na condição. */
export type FlowEdge = { id: string; source: string; target: string; sourceHandle?: string | null };
export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[] };

/** Configuração salva + padrões; nós antigos com `days` (inatividade) viram quantidade + unidade. */
function normalizeConfig(type: NodeType, saved: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = { ...NODE_DEF[type].defaults, ...saved };
  if ((type === "trigger_inactive" || type === "delay") && saved.amount === undefined && saved.days !== undefined) {
    const { amount, unit } = readDuration(saved);
    config.amount = amount;
    config.unit = unit;
    delete config.days;
  }
  if (config.filters !== undefined) {
    const filters = readFilters(config);
    if (filters.rules.length) config.filters = filters;
    else delete config.filters;
  }
  return config;
}

/** Lê o grafo salvo (JSON) descartando nós de tipo desconhecido e conexões soltas. */
export function sanitizeGraph(input: { nodes?: unknown; edges?: unknown }): FlowGraph {
  const nodes = (Array.isArray(input.nodes) ? input.nodes : [])
    .filter((node): node is FlowNode => !!node && typeof node === "object" && typeof (node as FlowNode).id === "string" && (node as FlowNode).type in NODE_DEF)
    .map((node) => ({
      id: node.id.slice(0, 80),
      type: node.type,
      position: { x: Number(node.position?.x) || 0, y: Number(node.position?.y) || 0 },
      data: { config: normalizeConfig(node.type, node.data?.config && typeof node.data.config === "object" ? node.data.config : {}), ...(node.data?.dir === "LR" ? { dir: "LR" as const } : {}) },
    }))
    .slice(0, 200);
  const ids = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(input.edges) ? input.edges : [])
    .filter((edge): edge is FlowEdge => !!edge && typeof edge === "object" && ids.has((edge as FlowEdge).source) && ids.has((edge as FlowEdge).target) && (edge as FlowEdge).source !== (edge as FlowEdge).target)
    .map((edge) => ({ id: String(edge.id).slice(0, 120), source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle === "true" || edge.sourceHandle === "false" ? edge.sourceHandle : null }))
    .slice(0, 400);
  return { nodes, edges };
}

export const triggerNodes = (graph: FlowGraph) => graph.nodes.filter((node) => isTrigger(node.type));
/** Primeiro gatilho (fluxos antigos e retomada sem nó atual). */
export const triggerNode = (graph: FlowGraph) => triggerNodes(graph)[0] ?? null;
/** Tipos de gatilho do fluxo, sem repetição, para a coluna triggerType ("trigger_message,trigger_tag"). */
export const triggerTypesOf = (graph: FlowGraph) => [...new Set(triggerNodes(graph).map((node) => node.type))];

/** Problemas que impedem ativar o fluxo. */
export function validateGraph(graph: FlowGraph): string[] {
  const problems: string[] = [];
  const triggers = triggerNodes(graph);
  if (triggers.length === 0) problems.push("Adicione um gatilho para iniciar o fluxo.");
  for (const trigger of triggers) {
    if (!graph.edges.some((edge) => edge.source === trigger.id)) problems.push(triggers.length > 1 ? `Conecte o gatilho "${NODE_DEF[trigger.type].label}" ao primeiro passo.` : "Conecte o gatilho ao primeiro passo.");
  }
  for (const node of graph.nodes) {
    const config = node.data.config;
    if (node.type === "send_whatsapp" && !String(config.text ?? "").trim() && !String(config.mediaUrl ?? "").trim() && !String(config.audio ?? "").trim()) problems.push("Enviar WhatsApp: escreva a mensagem ou anexe um áudio.");
    if (node.type === "send_whatsapp" && String(config.audio ?? "").trim() && !String(config.audio).startsWith(AUDIO_STORAGE_PREFIX) && !/^https?:\/\//i.test(String(config.audio).trim())) problems.push("Enviar WhatsApp: a nota de voz precisa ser um arquivo enviado ou uma URL http(s).");
    if (node.type === "http" && !/^https?:\/\//i.test(String(config.url ?? ""))) problems.push("Requisição HTTP: informe uma URL http(s).");
    if ((node.type === "add_tag" || node.type === "remove_tag" || node.type === "trigger_tag") && !String(config.tag ?? "").trim()) problems.push(`${NODE_DEF[node.type].label}: informe a tag.`);
    if (node.type === "assign" && !String(config.queueId ?? "").trim()) problems.push("Atribuir: escolha a fila.");
    if (node.type === "trigger_inactive" && !(readDuration(config, "days").amount > 0)) problems.push("Cliente inativo: informe o tempo sem contato.");
    if (node.type === "condition" && config.field === "none" && !readFilters(config).rules.length) problems.push("Condição: adicione ao menos uma regra em Regras & Filtros.");
    if (node.type === "condition" && config.field === "variable" && !String(config.variable ?? "").trim()) problems.push("Condição: informe o nome da variável.");
    if (node.type === "condition" && config.field !== "none" && CONDITION_OPERATORS.find((item) => item.value === config.operator)?.needsValue && !String(config.value ?? "").trim()) problems.push("Condição: informe o valor da comparação.");
    if (node.type === "add_note" && !String(config.text ?? "").trim()) problems.push("Adicionar observação: escreva o texto da nota.");
    if ((node.type === "trigger_erp_after_sale" || node.type === "trigger_erp_overdue" || node.type === "trigger_erp_good_payer" || node.type === "trigger_erp_no_purchase") && !(Number(config.amount) > 0)) problems.push(`${NODE_DEF[node.type].label}: informe o tempo.`);
    if ((node.type === "trigger_erp_due_soon" || node.type === "trigger_erp_birthday") && !(Number(config.amount) >= 0)) problems.push(`${NODE_DEF[node.type].label}: informe os dias.`);
    const filters = readFilters(config);
    if (filters.rules.some((rule) => FILTER_KIND[rule.kind].ops.find((op) => op.value === rule.op)?.needsValue && !String((rule as { value?: string }).value ?? "").trim())) problems.push(`${NODE_DEF[node.type].label}: complete o valor das regras & filtros.`);
  }
  return [...new Set(problems)];
}
