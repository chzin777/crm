/**
 * Regras puras do assistente "Nova campanha" (/campanhas): variáveis do modelo (campo do contato ou texto fixo),
 * prévia da mensagem, resumo do público válido, agendamento em horário de Brasília e validação por etapa.
 * Usado no navegador e no servidor (disparo e prévia do público).
 */
import { brWallTime } from "@/lib/br-time";
import { dedupeRecipients } from "@/lib/campaign-audience";
import { withoutOptedOut } from "@/lib/marketing-opt-out";

/** Variável do modelo com texto fixo: "fixo:Black Friday" vai igual para todos os contatos. */
export const FIXED_PREFIX = "fixo:";
export const isFixedParam = (field: string) => field.startsWith(FIXED_PREFIX);
export const fixedText = (field: string) => (isFixedParam(field) ? field.slice(FIXED_PREFIX.length) : "");

/** Campos dinâmicos disponíveis nas variáveis {{1}}, {{2}}... (mesmo nome usado no disparo). */
export const PARAM_FIELDS = [
  { value: "primeiro_nome", label: "Primeiro nome do cliente", example: "Maria" },
  { value: "nome", label: "Nome completo do cliente", example: "Maria Souza" },
  { value: "segmento", label: "Segmento", example: "Clientes Ouro" },
  { value: "telefone", label: "Telefone", example: "(62) 99999-0000" },
  { value: "email", label: "E-mail", example: "maria@exemplo.com" },
  { value: "data_nascimento", label: "Data de nascimento", example: "15/05/1990" },
  { value: "nome_atendente", label: "Nome do atendente (completo)", example: "Ana Souza" },
  { value: "primeiro_nome_atendente", label: "Primeiro nome do atendente", example: "Ana" },
] as const;

const FIELD_EXAMPLE: Record<string, string> = Object.fromEntries(PARAM_FIELDS.map((field) => [field.value, field.example]));
export const fieldLabel = (field: string) => (isFixedParam(field) ? "Texto fixo" : PARAM_FIELDS.find((item) => item.value === field)?.label ?? field);

/** Valor da variável para um contato: texto fixo ou o campo do contato ("-" quando vazio, a Meta recusa vazio). */
export function resolveParam(field: string, values: Record<string, string | undefined>) {
  if (isFixedParam(field)) return fixedText(field).trim() || "-";
  return values[field]?.trim() || "-";
}

/** Primeiro nome em formato de nome ("MARIA DA SILVA" → "Maria"). */
export function firstName(value: string | null | undefined) {
  const first = (value ?? "").trim().split(/\s+/)[0] ?? "";
  return first ? first.charAt(0).toLocaleUpperCase("pt-BR") + first.slice(1).toLocaleLowerCase("pt-BR") : "";
}

/** Corpo do modelo com as variáveis trocadas pelo exemplo (prévia do WhatsApp). */
export function renderPreview(body: string, params: string[], sample: Record<string, string> = FIELD_EXAMPLE) {
  return body.replace(/\{\{(\d+)\}\}/g, (match, number: string) => {
    const field = params[Number(number) - 1];
    if (field === undefined) return match;
    if (isFixedParam(field)) return fixedText(field).trim() || match;
    return sample[field] ?? FIELD_EXAMPLE[field] ?? match;
  });
}

/** Variáveis sem preenchimento: texto fixo vazio ou variável do corpo sem campo escolhido. */
export function missingParams(body: string, params: string[]) {
  const numbers = [...new Set((body.match(/\{\{(\d+)\}\}/g) ?? []).map((item) => Number(item.slice(2, -2))))].sort((a, b) => a - b);
  return numbers.filter((number) => {
    const field = params[number - 1];
    return !field || (isFixedParam(field) && !fixedText(field).trim());
  });
}

export type AudienceRecipient = { id: string; telefone: string };
export type AudienceSummary = { total: number; duplicates: number; optedOut: number; invalidPhone: number; valid: number };

/** Público que de fato recebe: sem repetidos, sem descadastrados (SAIR/PARAR) e só com celular válido. */
export function summarizeAudience(recipients: AudienceRecipient[], optOutKeys: Set<string>): AudienceSummary {
  const { unique, removed } = dedupeRecipients(recipients);
  const allowed = withoutOptedOut(unique, optOutKeys);
  const valid = allowed.filter((recipient) => (recipient.telefone ?? "").replace(/\D/g, "").length >= 10).length;
  return { total: recipients.length, duplicates: removed, optedOut: unique.length - allowed.length, invalidPhone: allowed.length - valid, valid };
}

export const MIN_SCHEDULE_MS = 5 * 60_000;
export const MAX_SCHEDULE_DAYS = 60;

/** "2026-11-28" + "09:30" (Brasília) → instante; erro legível se faltar, estiver no passado ou longe demais. */
export function parseSchedule(day: string, time: string, now: Date = new Date()): { at: Date } | { error: string } {
  const at = brWallTime(day, time);
  if (!at) return { error: "Informe a data e o horário do disparo." };
  if (at.getTime() < now.getTime() + MIN_SCHEDULE_MS) return { error: "Agende para pelo menos 5 minutos a partir de agora." };
  if (at.getTime() > now.getTime() + MAX_SCHEDULE_DAYS * 86_400_000) return { error: `Agende para no máximo ${MAX_SCHEDULE_DAYS} dias à frente.` };
  return { at };
}

/** Horário agendado fora da janela permitida (início/fim "HH:MM", domingo opcional), avaliado em Brasília. */
export function outsideSendWindow(day: string, time: string, window: { start: string; end: string; skipSundays?: boolean } | null | undefined) {
  if (!window) return false;
  if (window.skipSundays && new Date(`${day}T12:00:00Z`).getUTCDay() === 0) return true;
  return time < window.start || time >= window.end;
}

export type WizardState = {
  name: string;
  segments: number;
  audienceValid: number | null;
  message: string;
  hasTemplate: boolean;
  params: string[];
  uploading: boolean;
  schedule: { mode: "now" | "later"; day: string; time: string };
};

/** Erro da etapa (1 = configuração e público, 2 = mensagem, 3 = agendamento) ou "" se pode seguir. */
export function validateWizardStep(step: number, state: WizardState, now: Date = new Date()) {
  if (step === 1) {
    if (!state.name.trim()) return "Informe o nome da campanha.";
    if (state.segments === 0) return "Selecione pelo menos um segmento para o público.";
    if (state.audienceValid === 0) return "O público escolhido não tem nenhum contato válido para receber (sem descadastrados e com celular).";
  }
  if (step === 2) {
    if (!state.message.trim()) return state.hasTemplate ? "Escolha o modelo aprovado." : "Escolha um modelo aprovado ou escreva a mensagem.";
    if (state.hasTemplate) {
      const missing = missingParams(state.message, state.params);
      if (missing.length) return `Preencha a variável ${missing.map((number) => `{{${number}}}`).join(", ")} do modelo.`;
    }
    if (state.uploading) return "Aguarde o envio dos arquivos anexados terminar.";
  }
  if (step === 3 && state.schedule.mode === "later") {
    const parsed = parseSchedule(state.schedule.day, state.schedule.time, now);
    if ("error" in parsed) return parsed.error;
  }
  return "";
}
