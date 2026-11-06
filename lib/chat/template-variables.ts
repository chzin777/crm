import { formatPhone } from "@/lib/chat/phone";

export type TemplateContact = {
  nome: string;
  telefone: string;
  email: string;
  loja: string;
  ultimaCompra: string;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : value;
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** Atalhos que preenchem uma variável com dados do contato. */
export const VARIABLE_SOURCES: { id: string; label: string; value: (contact: TemplateContact) => string }[] = [
  { id: "name", label: "Nome do Cliente", value: (contact) => contact.nome.trim() },
  { id: "firstName", label: "Primeiro Nome", value: (contact) => firstName(contact.nome) },
  { id: "phone", label: "Telefone", value: (contact) => (contact.telefone ? formatPhone(contact.telefone) : "") },
  { id: "email", label: "Email", value: (contact) => contact.email },
  { id: "store", label: "Loja", value: (contact) => contact.loja },
  { id: "lastPurchase", label: "Data da Última Compra", value: (contact) => formatDate(contact.ultimaCompra) },
];

/** Maior índice usado no texto: é quantos parâmetros a Meta exige. */
export function templateVariableCount(text: string) {
  return Math.max(0, ...[...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1])));
}

export function fillTemplate(text: string, values: string[]) {
  return text.replace(/\{\{(\d+)\}\}/g, (match, index: string) => values[Number(index) - 1]?.trim() || match);
}

/** Exemplos que /modelos grava ao inserir uma variável; revelam o que ela significa. */
const KNOWN_EXAMPLES: Record<string, string> = { Maria: "firstName", "Óticas Brasil Centro": "store" };

const GREETING_BEFORE = /(?:ol[áa]|oi|prezad[oa]|car[oa]|bom dia|boa tarde|boa noite)[,\s]*$/i;

/** Só sugere quando o modelo deixa claro: na dúvida, o campo fica vazio para o atendente decidir. */
export function suggestVariable(body: string, index: number, examples: string[], contact: TemplateContact) {
  const known = KNOWN_EXAMPLES[examples[index]?.trim() ?? ""];
  const position = body.indexOf(`{{${index + 1}}}`);
  const sourceId = known ?? (position >= 0 && GREETING_BEFORE.test(body.slice(0, position)) ? "firstName" : undefined);
  return VARIABLE_SOURCES.find((source) => source.id === sourceId)?.value(contact) ?? "";
}
