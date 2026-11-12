import { z } from "zod";
import { STAGE_DEFINITIONS } from "@/lib/pipeline-stages";

export type RuleFieldType = "number" | "date" | "text" | "select" | "presence" | "purchase" | "campaign";

export interface RuleOperator {
  id: string;
  label: string;
  /** "none" = no value, "one" = single value, "two" = range */
  input: "none" | "one" | "two";
}

export interface RuleField {
  id: string;
  label: string;
  type: RuleFieldType;
  options?: readonly { value: string; label: string }[];
}

const numberOperators: RuleOperator[] = [
  { id: "eq", label: "é igual a", input: "one" },
  { id: "gt", label: "é maior que", input: "one" },
  { id: "gte", label: "é maior ou igual a", input: "one" },
  { id: "lt", label: "é menor que", input: "one" },
  { id: "lte", label: "é menor ou igual a", input: "one" },
  { id: "between", label: "está entre", input: "two" },
];

const textOperators: RuleOperator[] = [
  { id: "eq", label: "é igual a", input: "one" },
  { id: "neq", label: "é diferente de", input: "one" },
  { id: "contains", label: "contém", input: "one" },
  // Lista separada por vírgula (chips no construtor de critérios).
  { id: "in", label: "é um destes", input: "one" },
  { id: "not_in", label: "não é nenhum destes", input: "one" },
  { id: "filled", label: "está preenchido", input: "none" },
  { id: "empty", label: "está vazio", input: "none" },
];

const dateOperators: RuleOperator[] = [
  { id: "within_days", label: "nos últimos (dias)", input: "one" },
  { id: "older_days", label: "há mais de (dias)", input: "one" },
  { id: "before", label: "antes de", input: "one" },
  { id: "after", label: "depois de", input: "one" },
  { id: "between", label: "entre as datas", input: "two" },
  { id: "empty", label: "nunca ocorreu", input: "none" },
];

const selectOperators: RuleOperator[] = [
  { id: "eq", label: "é", input: "one" },
  { id: "neq", label: "não é", input: "one" },
];

const presenceOperators: RuleOperator[] = [
  { id: "filled", label: "está preenchido", input: "none" },
  { id: "empty", label: "está vazio", input: "none" },
];

// Pedido no ERP numa janela de datas (dia de Brasília), com filtros opcionais do próprio pedido.
const purchaseOperators: RuleOperator[] = [
  { id: "today", label: "hoje", input: "none" },
  { id: "yesterday", label: "ontem", input: "none" },
  { id: "within_days", label: "nos últimos (dias)", input: "one" },
  { id: "between", label: "entre as datas", input: "two" },
];

// valor = id do disparo (CampaignMessage.campaignId); valor2 = nome exibido.
const campaignOperators: RuleOperator[] = [
  { id: "converted", label: "converteram após receber", input: "one" },
  { id: "not_converted", label: "receberam e não compraram", input: "one" },
];

export const ruleFields: RuleField[] = [
  { id: "erpPurchase", label: "Comprou no ERP", type: "purchase" },
  { id: "campaignConversion", label: "Campanha", type: "campaign" },
  { id: "purchases", label: "Quantidade de pedidos (ERP)", type: "number" },
  { id: "avgTicket", label: "Ticket médio (R$)", type: "number" },
  { id: "totalSpent", label: "Total gasto acumulado – LTV (R$)", type: "number" },
  { id: "lastPurchase", label: "Última compra (ERP)", type: "date" },
  {
    id: "category",
    label: "Categoria do contato",
    type: "select",
    options: [
      { value: "cliente", label: "Cliente" },
      { value: "lead", label: "Lead" },
      { value: "nps", label: "NPS" },
      { value: "inativo", label: "Inativo" },
    ],
  },
  { id: "npsRating", label: "Nota de NPS recebida", type: "number" },
  {
    id: "npsAnswered",
    label: "Respondeu ao NPS",
    type: "select",
    options: [
      { value: "yes", label: "Sim" },
      { value: "no", label: "Não" },
    ],
  },
  { id: "city", label: "Cidade", type: "text" },
  { id: "neighborhood", label: "Bairro", type: "text" },
  { id: "state", label: "Estado (UF)", type: "text" },
  { id: "ddd", label: "DDD do telefone", type: "text" },
  { id: "tag", label: "Tag do cliente (atendimento)", type: "text" },
  {
    id: "pipelineStage",
    label: "Etapa atual do pipeline",
    type: "select",
    options: STAGE_DEFINITIONS.map((stage) => ({ value: stage.id, label: stage.titulo })),
  },
  {
    id: "gender",
    label: "Gênero",
    type: "select",
    options: [
      { value: "F", label: "Feminino" },
      { value: "M", label: "Masculino" },
    ],
  },
  { id: "occupation", label: "Profissão", type: "text" },
  { id: "segment", label: "Segmento do contato", type: "text" },
  { id: "phone", label: "Telefone", type: "presence" },
  { id: "email", label: "E-mail", type: "presence" },
];

export const operatorsByType: Record<RuleFieldType, RuleOperator[]> = {
  number: numberOperators,
  date: dateOperators,
  text: textOperators,
  select: selectOperators,
  presence: presenceOperators,
  purchase: purchaseOperators,
  campaign: campaignOperators,
};

export const getRuleField = (id: string) => ruleFields.find((field) => field.id === id);

export const getOperators = (fieldId: string) => {
  const field = getRuleField(fieldId);
  return field ? operatorsByType[field.type] : [];
};

export const getOperator = (fieldId: string, operatorId: string) =>
  getOperators(fieldId).find((operator) => operator.id === operatorId);

export const ruleSchema = z.object({
  campo: z.string().max(40),
  operador: z.string().max(40),
  valor: z.string().max(200).optional(),
  valor2: z.string().max(200).optional(),
  /** Só para "Comprou no ERP": restringe o pedido por loja, valor mínimo e produto/categoria. */
  filtros: z.object({
    loja: z.string().max(100).optional(),
    valorMin: z.string().max(20).optional(),
    produto: z.string().max(100).optional(),
  }).optional(),
});

export type SegmentRule = z.infer<typeof ruleSchema>;

/** Como as regras de um critério se combinam: todas (E) ou qualquer uma (OU). */
export type RuleMatch = "all" | "any";

export const MAX_RULES = 20;

/** Itens de uma regra em lista ("é um destes"): separados por vírgula, sem vazios nem repetidos. */
export const splitRuleList = (value: string | undefined) =>
  [...new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))];

/** Mesma normalização do SQL: maiúsculas, sem acento e sem espaços nas pontas. */
export const normalizeRuleText = (value: string) =>
  value.trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const isIsoDate = (value: string | undefined) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const isNumeric = (value: string | undefined) => !!value && value.trim() !== "" && Number.isFinite(Number(value.replace(",", ".")));

/** Returns an error message for an invalid rule, or null when it is valid. */
export function validateRule(rule: SegmentRule): string | null {
  const field = getRuleField(rule.campo);
  if (!field) return "Selecione o campo da regra.";
  const operator = getOperator(rule.campo, rule.operador);
  if (!operator) return `Selecione a condição para "${field.label}".`;
  if (field.type === "purchase" && rule.filtros?.valorMin && !isNumeric(rule.filtros.valorMin)) return "Informe um valor mínimo de pedido válido.";
  if (field.type === "campaign") return rule.valor?.trim() ? null : "Selecione a campanha.";
  if (field.type === "purchase" && operator.id === "within_days" && !(Number(rule.valor) >= 1)) return "Informe ao menos 1 dia em \"Comprou no ERP\".";
  if (operator.input === "none") return null;

  const values = operator.input === "two" ? [rule.valor, rule.valor2] : [rule.valor];
  for (const value of values) {
    if (field.type === "number" || ((field.type === "date" || field.type === "purchase") && operator.id.endsWith("_days"))) {
      if (!isNumeric(value)) return `Informe um número válido para "${field.label}".`;
      if (field.type === "date" && Number(value) < 0) return `Informe um número de dias válido para "${field.label}".`;
    } else if (field.type === "date" || field.type === "purchase") {
      if (!isIsoDate(value)) return `Escolha a data para "${field.label}".`;
    } else if (field.type === "select") {
      if (!field.options?.some((option) => option.value === value)) return `Selecione um valor para "${field.label}".`;
    } else if (!value?.trim()) {
      return operator.id === "in" || operator.id === "not_in"
        ? `Adicione ao menos um item em "${field.label}".`
        : `Informe o valor para "${field.label}".`;
    }
  }
  if (rule.campo === "ddd" && (operator.id === "in" || operator.id === "not_in") && splitRuleList(rule.valor).some((item) => !/^\d{2}$/.test(item))) {
    return "Cada DDD deve ter 2 dígitos.";
  }
  return null;
}

export function describeRule(rule: SegmentRule): string {
  const field = getRuleField(rule.campo);
  const operator = getOperator(rule.campo, rule.operador);
  if (!field || !operator) return "Regra inválida";
  if (field.type === "campaign") {
    const name = `"${rule.valor2 || rule.valor || ""}"`;
    return operator.id === "converted" ? `Converteram após receber a campanha ${name}` : `Receberam a campanha ${name} e não compraram`;
  }
  if (field.type === "purchase") {
    const br = (value?: string) => (value ?? "").split("-").reverse().join("/");
    const when = operator.id === "today" ? "hoje" : operator.id === "yesterday" ? "ontem"
      : operator.id === "within_days" ? `nos últimos ${rule.valor} dia(s)` : `entre ${br(rule.valor)} e ${br(rule.valor2)}`;
    const extras = [
      rule.filtros?.loja ? `loja ${rule.filtros.loja}` : "",
      rule.filtros?.valorMin ? `pedido a partir de R$ ${Number(rule.filtros.valorMin).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "",
      rule.filtros?.produto ? `produto/categoria contém "${rule.filtros.produto}"` : "",
    ].filter(Boolean);
    return `Comprou ${when}${extras.length ? ` (${extras.join(", ")})` : ""}`;
  }
  const format = (value?: string) => {
    if (field.type === "select") return field.options?.find((option) => option.value === value)?.label ?? value ?? "";
    if (field.type === "date" && !operator.id.endsWith("_days") && value) return value.split("-").reverse().join("/");
    return value ?? "";
  };
  if (operator.input === "none") return `${field.label} ${operator.label}`;
  if (operator.input === "two") return `${field.label} ${operator.label} ${format(rule.valor)} e ${format(rule.valor2)}`;
  return `${field.label} ${operator.label} ${format(rule.valor)}`;
}
