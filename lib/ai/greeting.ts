/**
 * Saudação informal pura ("opaa", "oiii", "bom diaaa", "eaí", "salve", "oii, tudo bem?"): é só abertura de conversa,
 * nunca nome de atendente, loja ou setor. Puro (sem banco).
 */

/** Letras repetidas em sequência viram uma ("opaaa" → "opa", "oiiii" → "oi", "bom diaaa" → "bom dia"). */
export function squeezeRepeats(text: string) {
  return text.replace(/(\p{L})\1+/gu, "$1");
}

const normalize = (text: string) =>
  squeezeRepeats(text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()).replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

/** Saudações reconhecidas (já sem acento e sem letras repetidas). */
const GREETINGS = /\b(?:oi|ola|opa|eae|eai|e ai|ae|fala|salve|hey|bom dia|boa tarde|boa noite|tudo bem|tudo bom|tudo certo|td bem|td bom|blz|beleza|como vai|como vc esta|como voce esta|joia|suave)\b/g;
/** Palavras que acompanham a saudação sem virar pedido ("oi pessoal", "boa tarde a todos", "e aí, tudo bem com vc?"). */
const COMPANIONS = new Set(["e", "ai", "a", "o", "com", "vc", "voce", "vcs", "voces", "pessoal", "gente", "todos", "td", "tudo", "bem", "bom", "por", "aqui", "ei", "ae", "ola", "s", "ne"].map(squeezeRepeats));

/** A mensagem é só saudação (uma ou mais), sem pedido, nome ou produto. */
export function isPureGreeting(text: string | null | undefined) {
  const clean = normalize(text ?? "");
  if (!clean || clean.split(" ").length > 8) return false;
  const rest = clean.replace(GREETINGS, " ").split(" ").filter(Boolean);
  if (rest.length === clean.split(" ").length) return false;
  return rest.every((word) => COMPANIONS.has(word));
}

/** Dica do turno: saudação pura → abertura acolhedora direta, sem interpretar a palavra como nome/loja/setor. */
export const PURE_GREETING_HINT = "SAUDAÇÃO PURA NESTE TURNO: a mensagem do cliente é só um cumprimento informal (do tipo opa, oi esticado, eaí, salve). Responda com uma abertura acolhedora, curta e com suas palavras, convidando a pessoa a contar o que procura; se ela perguntou como você está, retribua antes. NUNCA trate o cumprimento como nome de pessoa, atendente, loja ou setor e não transfira.";
