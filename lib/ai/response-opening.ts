import { brasiliaGreeting, greetingName } from "@/lib/ai/agent-core";
import { isPureGreeting, squeezeRepeats } from "@/lib/ai/greeting";
import { fit, LIST_LIMITS, type InteractiveShowcase } from "@/lib/ai/interactive-showcase";

const CUSTOMER_GREETING = /^\s*(?:bom dia|boa tarde|boa noite|oi+|ol[áa]|e a[íi])(?!\p{L})/iu;
const OPENING = /^\s*(?:(?:bom dia|boa tarde|boa noite|oi+|ol[áa]|e a[íi])(?:\s*,?\s*[\p{L}]+)?\s*[!,.]+(?:\s*😊)?\s*)+/iu;

export function welcomeReply(text: string, input: { first: boolean; returning?: boolean; customer?: string | null; pendingText: string; now?: Date; variant?: number }) {
  // Já saudou nesta conversa e o cliente não cumprimentou de novo: nada de "Boa tarde!"/"Oi" repetido no começo.
  if (!input.first && !CUSTOMER_GREETING.test(squeezeRepeats(input.pendingText)) && !isPureGreeting(input.pendingText)) return withoutRepeatedGreeting(text);
  // Só nome próprio válido do cadastro (sem telefone, apelido curto ou emoji): senão, saudação sem nome.
  const name = greetingName(input.customer);
  const greeting = `${brasiliaGreeting(input.now).greeting}${name ? `, ${name}` : ""}!`;
  const variants = ["Que bom te ver por aqui de novo 😊", "Que alegria falar com você novamente! 😊", "Seja muito bem-vindo(a) de volta! 😊"];
  const welcome = input.first && input.returning ? variants[(input.variant ?? Math.floor(Math.random() * variants.length)) % variants.length] : "😊";
  const body = text.replace(OPENING, "").trim();
  return `${greeting} ${welcome}${body ? ` ${body}` : ""}`;
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
