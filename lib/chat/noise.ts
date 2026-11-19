/**
 * Triagem determinística de "ruído" recebido no WhatsApp (antes de fila, IA e timer de inatividade).
 * Funções puras: usadas pela entrada de mensagens, pelo relógio do chat e pelos testes.
 */

/** Marca gravada em ChatMessage.authorName das mensagens do cliente ignoradas pela triagem (sem fila, IA ou timer). */
export const NOISE_AUTHOR = "Mensagem ignorada (ruído)";

export type NoiseKind = "sticker" | "pontuacao" | "risada" | "link" | "imagem_aleatoria" | "auto_resposta";

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const URL = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|com\.br|net|org|ly|me|be|gl|io)\/\S*/gi;

/** Pedido ou dúvida comercial junto do link: aí o link é contexto ("tem esse modelo?") e segue o fluxo. */
const COMMERCIAL = /\b(oculos|armac\w*|lentes?|grau|sol|receita|preco|valor|quanto|custa|tem|teria|quero|queria|gostaria|comprar|loja|modelo|esse|essa|este|esta|igual|parecid\w*|parcel\w*|pix|boleto|pedido|entrega|ajuda|duvida|atendente|orcamento)\b/;

const LAUGH = /^(?:k{2,}|(?:ha){2,}h?|(?:he){2,}h?|(?:hi){2,}h?|(?:rs){2,}|(?:hu){2,}|(?:ks){2,}|(?:a?ha)+|k+)$/;

/** Só pontuação, espaços ou emojis (".", "..", "?", "!", "👍", "😂😂"). */
export function isPunctuationOnly(text: string) {
  return !/[\p{L}\p{N}]/u.test(text);
}

/** Risada solta ("kkkk", "hahaha", "rsrs"), sem pergunta. */
export function isLaughOnly(text: string) {
  if (text.includes("?")) return false;
  const words = plain(text).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((word) => LAUGH.test(word));
}

/** Link externo (YouTube, TikTok, Instagram, corrente...) sem texto pedindo atendimento ou com dúvida comercial. */
export function isRandomLink(text: string) {
  const urls = text.match(URL);
  if (!urls?.length) return false;
  const rest = plain(text.replace(URL, " ")).replace(/[^\p{L}\p{N}?\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (rest.includes("?") || COMMERCIAL.test(rest)) return false;
  return rest.split(" ").filter(Boolean).length <= 6;
}

/**
 * Classifica a mensagem recebida. Imagem sem legenda não é decidida aqui (precisa de visão computacional);
 * mídia com legenda, áudio, documento, localização e botões nunca são ruído.
 */
export function classifyNoise(input: { type: string | undefined; text: string; hasMedia: boolean }): NoiseKind | null {
  const text = input.text.trim();
  if (input.type === "sticker") return text ? null : "sticker";
  if (input.type !== "text") return null;
  if (!text || isPunctuationOnly(text)) return "pontuacao";
  if (isLaughOnly(text)) return "risada";
  if (isRandomLink(text)) return "link";
  return null;
}
