import { brasiliaGreeting } from "@/lib/ai/agent-core";
import { isPureGreeting, squeezeRepeats } from "@/lib/ai/greeting";
import { fit, LIST_LIMITS, type InteractiveShowcase } from "@/lib/ai/interactive-showcase";

const CUSTOMER_GREETING = /^\s*(?:bom dia|boa tarde|boa noite|oi+|ol[áa]|e a[íi])(?!\p{L})/iu;

/**
 * A saudação é escrita pelo modelo (sem frase pronta nem "bem-vindo de volta" fixo). Aqui só: tirar a saudação
 * repetida em turno já saudado e, na primeira resposta, corrigir o período do dia se o modelo errou.
 */
export function welcomeReply(text: string, input: { first: boolean; returning?: boolean; customer?: string | null; pendingText: string; now?: Date; variant?: number }) {
  // Já saudou nesta conversa e o cliente não cumprimentou de novo: nada de "Boa tarde!"/"Oi" repetido no começo.
  if (!input.first && !CUSTOMER_GREETING.test(squeezeRepeats(input.pendingText)) && !isPureGreeting(input.pendingText)) return withoutRepeatedGreeting(text);
  const greeting = brasiliaGreeting(input.now).greeting;
  return text.replace(/^(\s*)(bom dia|boa tarde|boa noite)(?=[\s,!.]|$)/i, (_match, space: string) => `${space}${greeting}`);
}

/**
 * Emojis de expressão (rostos, corações, mãos, brilhos): no máximo 1 por resposta inteira, mantendo o primeiro.
 * Ícones da vitrine/ficha (👓 🕶️ 📍) não contam e ficam intactos.
 */
const EXPRESSIVE_EMOJI = /(?:[\u{1F600}-\u{1F64F}\u{1F910}-\u{1F92F}\u{1F970}-\u{1F97A}\u{1F44B}-\u{1F450}\u{1F64C}\u{1F64F}\u{1F48B}-\u{1F49F}\u{2728}\u{2764}\u{263A}\u{1F917}\u{1F929}](?:\u{FE0F}|[\u{1F3FB}-\u{1F3FF}])*)/gu;
export function singleEmoji(text: string) {
  if ((text.match(EXPRESSIVE_EMOJI) ?? []).length <= 1) return text;
  let first = true;
  return text
    .replace(EXPRESSIVE_EMOJI, (emoji) => {
      if (!first) return "\u0000";
      first = false;
      return emoji;
    })
    .replace(/[ \t]*\u0000[ \t]*/g, " ")
    .replace(/ +([!?.,;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t]+/gm, "")
    .trim();
}

/** Tira a saudação de abertura ("Boa tarde, <nome>! 😊", "Oi!") de uma resposta de turno já saudado. */
export function withoutRepeatedGreeting(text: string) {
  const body = text.replace(REPEATED_OPENING, "");
  if (body === text || !body.trim()) return text;
  return body.charAt(0).toUpperCase() + body.slice(1);
}
const REPEATED_OPENING = /^\s*(?:(?:bom dia|boa tarde|boa noite|oi+|ol[áa])(?:\s*,\s*[\p{L}]+)?\s*[!.]+(?:\s*😊)?\s*)+/iu;

/** A lista é a única mensagem: seu corpo contém a abertura, e o texto numerado é o fallback. */
export function listWithOpening(list: InteractiveShowcase, text: string): InteractiveShowcase {
  const introduction = text.split(/\n\s*\d{1,2}[.)]\s/)[0].replace(/\s*(?:---SPLIT---|\[SPLIT\])\s*/gi, " ").trim();
  return { ...list, bodyText: fit(introduction || list.bodyText, LIST_LIMITS.body) };
}
