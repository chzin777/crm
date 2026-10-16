import { z } from "zod";

export type RuleFieldType = "number" | "date" | "text" | "select" | "presence";

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

export const ruleFields: RuleField[] = [
  { id: "purchases", label: "Quantidade de compras", type: "number" },
  { id: "totalSpent", label: "Total gasto (R$)", type: "number" },
  { id: "lastPurchase", label: "Data da última compra", type: "date" },
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
});

export type SegmentRule = z.infer<typeof ruleSchema>;

export const MAX_RULES = 10;

const isIsoDate = (value: string | undefined) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const isNumeric = (value: string | undefined) => !!value && value.trim() !== "" && Number.isFinite(Number(value.replace(",", ".")));

/** Returns an error message for an invalid rule, or null when it is valid. */
export function validateRule(rule: SegmentRule): string | null {
  const field = getRuleField(rule.campo);
  if (!field) return "Selecione o campo da regra.";
  const operator = getOperator(rule.campo, rule.operador);
  if (!operator) return `Selecione a condição para "${field.label}".`;
  if (operator.input === "none") return null;

  const values = operator.input === "two" ? [rule.valor, rule.valor2] : [rule.valor];
  for (const value of values) {
    if (field.type === "number" || (field.type === "date" && operator.id.endsWith("_days"))) {
      if (!isNumeric(value)) return `Informe um número válido para "${field.label}".`;
      if (field.type === "date" && Number(value) < 0) return `Informe um número de dias válido para "${field.label}".`;
    } else if (field.type === "date") {
      if (!isIsoDate(value)) return `Escolha a data para "${field.label}".`;
    } else if (field.type === "select") {
      if (!field.options?.some((option) => option.value === value)) return `Selecione um valor para "${field.label}".`;
    } else if (!value?.trim()) {
      return `Informe o valor para "${field.label}".`;
    }
  }
  return null;
}

export function describeRule(rule: SegmentRule): string {
  const field = getRuleField(rule.campo);
  const operator = getOperator(rule.campo, rule.operador);
  if (!field || !operator) return "Regra inválida";
  const format = (value?: string) => {
    if (field.type === "select") return field.options?.find((option) => option.value === value)?.label ?? value ?? "";
    if (field.type === "date" && !operator.id.endsWith("_days") && value) return value.split("-").reverse().join("/");
    return value ?? "";
  };
  if (operator.input === "none") return `${field.label} ${operator.label}`;
  if (operator.input === "two") return `${field.label} ${operator.label} ${format(rule.valor)} e ${format(rule.valor2)}`;
  return `${field.label} ${operator.label} ${format(rule.valor)}`;
}
