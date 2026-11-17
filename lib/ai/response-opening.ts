import { brasiliaGreeting } from "@/lib/ai/agent-core";
import { contactFirstName } from "@/lib/ai/staff-request";
import { isPureGreeting, squeezeRepeats } from "@/lib/ai/greeting";
import { fit, LIST_LIMITS, type InteractiveShowcase } from "@/lib/ai/interactive-showcase";

const CUSTOMER_GREETING = /^\s*(?:bom dia|boa tarde|boa noite|oi+|ol[áa]|e a[íi])(?!\p{L})/iu;
const OPENING = /^\s*(?:(?:bom dia|boa tarde|boa noite|oi+|ol[áa]|e a[íi])(?:\s*,?\s*[\p{L}]+)?\s*[!,.]+(?:\s*😊)?\s*)+/iu;

export function welcomeReply(text: string, input: { first: boolean; returning?: boolean; customer?: string | null; pendingText: string; now?: Date; variant?: number }) {
  if (!input.first && !CUSTOMER_GREETING.test(squeezeRepeats(input.pendingText)) && !isPureGreeting(input.pendingText)) return text;
  const name = contactFirstName(input.customer);
  const greeting = `${brasiliaGreeting(input.now).greeting}${name ? `, ${name}` : ""}!`;
  const variants = ["Que bom te ver por aqui de novo 😊", "Que alegria falar com você novamente! 😊", "Seja muito bem-vindo(a) de volta! 😊"];
  const welcome = input.first && input.returning ? variants[(input.variant ?? Math.floor(Math.random() * variants.length)) % variants.length] : "😊";
  const body = text.replace(OPENING, "").trim();
  return `${greeting} ${welcome}${body ? ` ${body}` : ""}`;
}

/** A lista é a única mensagem: seu corpo contém a abertura, e o texto numerado é o fallback. */
export function listWithOpening(list: InteractiveShowcase, text: string): InteractiveShowcase {
  const introduction = text.split(/\n\s*\d{1,2}[.)]\s/)[0].replace(/\s*(?:---SPLIT---|\[SPLIT\])\s*/gi, " ").trim();
  return { ...list, bodyText: fit(introduction || list.bodyText, LIST_LIMITS.body) };
}
