/**
 * Encerramento silencioso: depois que a IA já se despediu, um "ok", "obrigado" ou "👍" do cliente não recebe
 * mais resposta (nem transferência). Sem banco nem rede.
 */

/** Token interno que o modelo pode devolver para não responder; nunca chega ao cliente. */
export const NO_REPLY_TOKEN = "[NO_REPLY]";

const COURTESY_WORDS = new Set([
  "ok", "okay", "okk", "oki", "obrigado", "obrigada", "obrigadoo", "obg", "obgd", "obgda", "brigado", "brigada", "valeu", "vlw", "valew",
  "ta", "tah", "to", "bom", "tabom", "blz", "beleza", "show", "perfeito", "combinado", "certo", "certinho", "ate", "mais", "logo", "breve",
  "tchau", "tchauu", "xau", "muito", "muitissimo", "mto", "mt", "igualmente", "nada", "de", "vc", "voce", "ce", "ja", "me", "ajudou",
  "ajudou", "entendi", "entendido", "otimo", "top", "joia", "legal", "grato", "grata", "agradeco", "pela", "atencao", "ajuda", "e", "a",
  "o", "entao", "pra", "por", "tudo", "isso", "era", "so", "fechado", "abracos", "abraco", "abs", "bjs", "beijos", "deus", "abencoe",
  "kk", "kkk", "rs", "hehe", "ah", "aham", "uhum", "bem", "tranquilo", "suave", "dia", "tarde", "noite", "boa", "otima", "otimo",
]);

const simplify = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Mensagem só de cortesia/fechamento ("ok", "obrigado", "valeu", "tá bom", "👍", "blz", "até mais"). */
export function isCourtesyClosing(text: string) {
  const raw = text.trim();
  if (!raw || raw.length > 80 || raw.includes("?")) return false;
  const words = simplify(raw).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  // Só emoji de concordância/agradecimento.
  if (!words.length) return /[\u{1F44D}\u{1F64F}\u{1F60A}\u{1F642}\u{2764}\u{1F44C}\u{1F44F}\u{1F64C}\u{1F60D}\u{1F970}\u{1F618}\u{2705}]/u.test(raw);
  return words.every((word) => COURTESY_WORDS.has(word) || /^(k+|rs+|ha+|he+)$/.test(word)) && words.some((word) => !["e", "a", "o", "de", "pra", "por", "me", "ja", "so", "bem"].includes(word));
}

const FAREWELL = /\b(por nada|disponha|at[eé] mais|at[eé] logo|at[eé] breve|tchau|é só chamar|e so chamar|só chamar|so chamar|estamos à disposição|estou à disposição|à disposição|foi um prazer|imagina|ótimo dia|otimo dia|ótima tarde|otima tarde|ótima noite|otima noite|boa semana|bom fim de semana|qualquer coisa,? (é só|me) )/i;

/** A última mensagem da IA foi uma despedida (sem pergunta em aberto). */
export function isFarewell(text: string | null | undefined) {
  const value = text?.trim() ?? "";
  return !!value && FAREWELL.test(value) && !/\?\s*\S{0,3}$/.test(value);
}

/** Silêncio elegante: a IA já se despediu e o cliente só mandou mais um fechamento de cortesia. */
export function silentClosing(input: { pendingText: string; lastAiText: string | null | undefined; hasMedia?: boolean }) {
  return !input.hasMedia && isCourtesyClosing(input.pendingText.replace(/\n+/g, " ")) && isFarewell(input.lastAiText);
}

/** Regra fixa do prompt: uma despedida só, sem empurrar perguntas; depois disso, silêncio. */
export const CLOSING_RULES = [
  "ENCERRAMENTO (regra fixa): quando o cliente agradecer ou encerrar (\"ok, você já me ajudou, muito obrigado\"), responda UMA única vez, curto e caloroso, sem fazer nova pergunta nem oferecer mais nada (ex.: \"Por nada! Qualquer coisa que precisar, é só chamar por aqui 😊\").",
  `Se você já se despediu na sua última mensagem e o cliente mandar só mais um fechamento de cortesia (\"ok\", \"obrigado\", \"valeu\", \"tá bom\", \"👍\", \"até mais\"), NÃO responda: use action "no_reply" com reply vazio (ou reply ${NO_REPLY_TOKEN}). Nunca mande uma segunda despedida.`,
].join("\n");
