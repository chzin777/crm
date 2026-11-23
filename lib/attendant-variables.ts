/**
 * Variáveis do atendente em modelos e mensagens: {{nome_atendente}} (nome completo) e {{primeiro_nome_atendente}}.
 * Sem atendente (disparo em massa para contato sem operador atribuído), as duas viram o nome de equipe configurado
 * em /configuracoes: nunca ficam literais nem vazias (a Cloud API recusa parâmetro vazio).
 */
export const DEFAULT_ATTENDANT_FALLBACK = "Equipe Óticas Brasil";

export const ATTENDANT_FIELDS = [
  { value: "nome_atendente", label: "Nome do atendente (completo)", example: "Ana Souza" },
  { value: "primeiro_nome_atendente", label: "Primeiro nome do atendente", example: "Ana" },
] as const;
export type AttendantField = (typeof ATTENDANT_FIELDS)[number]["value"];
export const ATTENDANT_FIELD_VALUES: string[] = ATTENDANT_FIELDS.map((field) => field.value);
export const isAttendantField = (field: string): field is AttendantField => ATTENDANT_FIELD_VALUES.includes(field);

export type AttendantValues = Record<AttendantField, string>;

export function attendantValues(name: string | null | undefined, fallback?: string | null): AttendantValues {
  const clean = (name ?? "").replace(/\s+/g, " ").trim();
  const team = (fallback ?? "").replace(/\s+/g, " ").trim() || DEFAULT_ATTENDANT_FALLBACK;
  if (!clean) return { nome_atendente: team, primeiro_nome_atendente: team };
  return { nome_atendente: clean, primeiro_nome_atendente: clean.split(" ")[0] || clean };
}

const ATTENDANT_TOKEN = /\{\{\s*(nome_atendente|primeiro_nome_atendente)\s*\}\}/gi;
export const hasAttendantToken = (text: string) => new RegExp(ATTENDANT_TOKEN.source, "i").test(text);

/** Troca {{nome_atendente}} e {{primeiro_nome_atendente}} pelo atendente (ou pelo nome da equipe). */
export function fillAttendantTokens(text: string, values: AttendantValues): string {
  return text.replace(ATTENDANT_TOKEN, (_match, key: string) => values[key.toLowerCase() as AttendantField]);
}
