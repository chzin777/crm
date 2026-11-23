import { withoutSplitMarkers } from "@/lib/chat/text";

/** Autor das mensagens que a IA envia no WhatsApp (o envio automático saneia tudo que sai com este nome). */
export const AI_AUTHOR_NAME = "Assistente IA";

// Travessão, meia-risca, traço numérico, barra horizontal e sinal de menos: nunca são escrita natural de WhatsApp.
const LONG_DASHES = "\u2012\u2013\u2014\u2015\u2212";
const BULLET = new RegExp(`^[ \\t]*(?:[-${LONG_DASHES}\u2022]+)[ \\t]+`, "gm");
/**
 * Traço usado como pontuação: qualquer travessão/meia-risca, hífen repetido ou hífen que não está colado entre duas
 * letras/números. Hífen dentro de palavra ou número (Ray-Ban, guarda-chuva, 99876-5432, RB4165-601, Av. T-8) fica.
 */
const SEPARATOR = new RegExp(`[ \\t]*(?:[${LONG_DASHES}]+-*|-{2,}|(?<![\\p{L}\\p{N}])-+|-+(?![\\p{L}\\p{N}]))[ \\t]*`, "gu");
const OPENING = new Set(["(", "[", "\"", "“", "'"]);
const CLOSING = new Set([".", ",", ";", ":", "!", "?", ")", "]", "\"", "”", "'"]);

/**
 * Pós-processamento obrigatório de todo texto da IA (atendimento automático e copiloto do /chat): marcador de lista
 * com traço vira linha limpa; traço como pausa/separador vira vírgula (entre números, "a": "300–500" → "300 a 500");
 * no começo ou fim de linha, some. Nenhum "-", "–" ou "—" sobra como pontuação.
 */
export function sanitizeAiResponse(text: string): string {
  if (!text) return text;
  const clean = withoutSplitMarkers(text.replace(/\r\n/g, "\n"))
    .replace(BULLET, "")
    .replace(SEPARATOR, (match: string, offset: number, whole: string) => {
      const lineBefore = whole.slice(whole.lastIndexOf("\n", offset - 1) + 1, offset);
      const after = whole.slice(offset + match.length);
      const lineAfter = after.split("\n", 1)[0];
      const prev = lineBefore.trimEnd().slice(-1);
      const next = lineAfter.trimStart().charAt(0);
      if (!prev || !next) return "";
      if (/\p{N}/u.test(prev) && /\p{N}/u.test(next) && /[\u2012\u2013\u2014\u2015]/.test(match)) return " a ";
      if (OPENING.has(prev) || CLOSING.has(next)) return prev === "(" || prev === "[" ? "" : " ";
      // Depois de pontuação de frase, o traço só some; depois de parêntese/aspas fechando, vira vírgula normal.
      if (/[.,;:!?]/.test(prev)) return " ";
      return ", ";
    });
  return clean
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:!?)])/g, "$1").replace(/,{2,}/g, ",").replace(/,([.!?])/g, "$1").replace(/^[ \t]*,[ \t]*/, "").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
