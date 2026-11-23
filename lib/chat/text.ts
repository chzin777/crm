import { brClock } from "@/lib/br-time";
import { attendantValues } from "@/lib/attendant-variables";

/** Troca travessões por hífen na saída para o cliente. */
/** Garantia final: o marcador de bolhas (---SPLIT--- / [SPLIT]) nunca chega ao cliente; vira quebra de parágrafo. */
export function withoutSplitMarkers(text: string) {
  if (!/-{2,}\s*split\s*-{2,}|\[\s*split\s*\]/i.test(text)) return text;
  return text.replace(/[ \t]*\n?[ \t]*(?:-{2,}\s*split\s*-{2,}|\[\s*split\s*\])[ \t]*\n?[ \t]*/gi, "\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function withoutDashes(text: string) {
  return withoutSplitMarkers(text).replace(/\s*[—–]\s*/g, " - ").replace(/ {2,}/g, " ");
}

export type TextVariables = {
  customer?: string | null;
  agent?: string | null;
  queue?: string | null;
};

export const TEXT_VARIABLES = [
  { mark: "{cliente}", description: "primeiro nome do cliente" },
  { mark: "{nome}", description: "primeiro nome do cliente" },
  { mark: "{cliente_completo}", description: "nome completo do cliente" },
  { mark: "{atendente}", description: "primeiro nome de quem atende" },
  { mark: "{{nome_atendente}}", description: "nome completo de quem atende" },
  { mark: "{{primeiro_nome_atendente}}", description: "primeiro nome de quem atende" },
  { mark: "{fila}", description: "fila da conversa" },
  { mark: "{saudacao}", description: "bom dia, boa tarde ou boa noite" },
];

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** Saudação pela hora de Brasília: no servidor (UTC) getHours() dava "boa noite" às 15h. */
export function greetingFor(now: Date) {
  const { hour } = brClock(now);
  if (hour < 12) return "bom dia";
  if (hour < 18) return "boa tarde";
  return "boa noite";
}

/** Preenche as variáveis conhecidas; marca desconhecida some, para não chegar ao cliente. */
export function fillVariables(text: string, data: TextVariables = {}, now = new Date()) {
  const customer = (data.customer ?? "").trim();
  const agent = (data.agent ?? "").trim();
  const values: Record<string, string> = {
    cliente: firstName(customer),
    nome: firstName(customer),
    cliente_completo: customer,
    atendente: agent ? firstName(agent) : "nossa equipe",
    fila: (data.queue ?? "").trim(),
    saudacao: greetingFor(now),
    // {{nome_atendente}} / {{primeiro_nome_atendente}}: sem atendente, o nome da equipe (nunca vazio).
    ...attendantValues(agent),
  };
  return text
    .replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (mark, key: string) => values[key.toLowerCase()] ?? mark)
    .replace(/\{([a-zA-Z_]+)\}/g, (mark, key: string) => (key.toLowerCase() === "menu" ? mark : values[key.toLowerCase()] ?? ""))
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").replace(/[ \t]+$/g, ""))
    .join("\n");
}
