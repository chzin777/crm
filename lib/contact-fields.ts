/**
 * Campos personalizados do contato: definição (chave, rótulo, tipo, opções) e normalização dos valores.
 * Puro: usado pelas rotas, pela tela, pelo motor de automações e pela IA.
 */

export const FIELD_TYPES = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "date", label: "Data" },
  { value: "select", label: "Seleção" },
] as const;
export type FieldType = (typeof FIELD_TYPES)[number]["value"];
export type ContactFieldDefinition = { id: string; key: string; label: string; type: FieldType; options: string[]; order: number };

export const MAX_FIELDS = 60;
const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Chave a partir do rótulo: "Loja preferida" → "loja_preferida". */
export function fieldKey(label: string) {
  return plain(label).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export const isFieldType = (value: unknown): value is FieldType => FIELD_TYPES.some((item) => item.value === value);

export function readDefinition(raw: { id: string; key: string; label: string; type: string; options: unknown; order: number }): ContactFieldDefinition {
  return {
    id: raw.id, key: raw.key, label: raw.label, type: isFieldType(raw.type) ? raw.type : "text", order: raw.order,
    options: Array.isArray(raw.options) ? raw.options.map((item) => String(item).trim().slice(0, 80)).filter(Boolean).slice(0, 50) : [],
  };
}

/**
 * Valor normalizado do campo (sempre texto): número com ponto, data em AAAA-MM-DD (aceita dd/mm/aaaa) e seleção
 * só com opção existente (sem diferenciar maiúsculas). Inválido → null; vazio → "" (limpa o campo).
 */
export function normalizeFieldValue(def: Pick<ContactFieldDefinition, "type" | "options">, raw: unknown): string | null {
  const value = String(raw ?? "").trim().slice(0, 500);
  if (!value) return "";
  if (def.type === "number") {
    const parsed = Number(value.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? String(parsed) : null;
  }
  if (def.type === "date") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
    const [year, month, day] = iso ? [iso[1], iso[2], iso[3]] : br ? [br[3], br[2].padStart(2, "0"), br[1].padStart(2, "0")] : [];
    if (!year) return null;
    const date = new Date(`${year}-${month}-${day}T12:00:00Z`);
    return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(day) ? null : `${year}-${month}-${day}`;
  }
  if (def.type === "select") return def.options.find((option) => plain(option) === plain(value)) ?? null;
  return value;
}

/** Valores salvos no contato (JSON) como mapa chave → texto. */
export function readCustomFields(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, value]) => value !== null && value !== undefined && String(value) !== "").map(([key, value]) => [key, String(value)]));
}

/** Exibição: data em dd/mm/aaaa, o resto como está. */
export function displayFieldValue(def: Pick<ContactFieldDefinition, "type">, value: string) {
  if (def.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join("/");
  return value;
}
