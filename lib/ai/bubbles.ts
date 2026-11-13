/**
 * Respostas em mais de uma bolha (cadência de conversa no WhatsApp): a IA separa a informação principal da
 * pergunta de condução com ---SPLIT---; o envio manda cada parte em ordem, com "digitando..." e uma pausa curta.
 * Sem banco: o mesmo corte vale para o WhatsApp e para o teste da página /ia.
 */

export const BUBBLE_SPLIT = "---SPLIT---";
export const MAX_BUBBLES = 3;
/** Pausa natural entre as bolhas (600 a 1000 ms). */
export const BUBBLE_DELAY_MIN_MS = 600;
export const BUBBLE_DELAY_MAX_MS = 1000;

/** Aceita variações do separador (espaços, caixa, traços a mais) e nunca deixa o token vazar para o cliente. */
const SPLIT_PATTERN = /\s*-{2,}\s*split\s*-{2,}\s*/gi;

export function splitBubbles(text: string | null | undefined, max = MAX_BUBBLES): string[] {
  const parts = (text ?? "")
    .split(SPLIT_PATTERN)
    .map((part) => part.replace(/^-{3,}\s*$/gm, "").trim())
    .filter(Boolean);
  if (parts.length <= max) return parts;
  // Mais partes que o limite: as excedentes vão juntas na última bolha.
  return [...parts.slice(0, max - 1), parts.slice(max - 1).join("\n\n")];
}

/** Texto sem o separador (histórico, notas e contagem de caracteres). */
export function joinBubbles(text: string | null | undefined) {
  return splitBubbles(text, Number.MAX_SAFE_INTEGER).join("\n\n");
}

export const bubbleDelay = (random = Math.random) => Math.round(BUBBLE_DELAY_MIN_MS + random() * (BUBBLE_DELAY_MAX_MS - BUBBLE_DELAY_MIN_MS));

/**
 * Envia as bolhas em ordem: a primeira pelo envio principal (pode ser foto com legenda); antes de cada uma das
 * seguintes, "digitando..." e pausa de 600 a 1000 ms. Falha do indicador não interrompe o envio.
 */
export async function sendBubbles(
  parts: string[],
  deps: { sendFirst: (text: string) => Promise<unknown>; sendNext: (text: string) => Promise<unknown>; typing?: () => Promise<unknown>; sleep?: (ms: number) => Promise<void>; delay?: () => number },
) {
  if (!parts.length) return 0;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  await deps.sendFirst(parts[0]);
  for (const part of parts.slice(1)) {
    await Promise.resolve().then(() => deps.typing?.()).catch(() => undefined);
    await sleep((deps.delay ?? bubbleDelay)());
    await deps.sendNext(part);
  }
  return parts.length;
}

/** Regra fixa do prompt: lista de lojas escaneável e pergunta de condução em bolha separada. */
export const FORMAT_RULES = [
  "FORMATAÇÃO E CADÊNCIA NO WHATSAPP (regra fixa):",
  "- Ao listar 2 ou mais lojas, use a formatação do WhatsApp: agrupe por cidade/região quando houver cidades diferentes (use o campo \"cidade\" das lojas; nunca misture DF com Goiás na mesma lista), com o título 📍 *Cidade*; cada loja numa linha \"• *Nome da loja* — endereço\" (nome em negrito com um asterisco de cada lado, endereço curto).",
  "- Mostre no máximo 5 lojas; se houver mais, priorize a cidade/região que o cliente mencionou e diga que há outras unidades.",
  "- Exemplo:\nTemos o *Ray-Ban Meta* disponível nestas unidades:\n\n📍 *Goiânia*\n• *Setor Bueno* — Av. T-8, 235\n• *Jardim Goiás* — Av. Dep. Jamel Cecílio, 3300\n\n📍 *Aparecida de Goiânia*\n• *Jardim Nova Era* — Av. Rio Verde\n\n📍 *Águas Claras (DF)*\n• *Areal* — QS 1, Rua 210\n---SPLIT---\nQual dessas lojas fica mais fácil pra você ir experimentar?",
  `- Nunca cole a pergunta de condução no fim de uma lista ou de uma resposta informativa longa: escreva ${BUBBLE_SPLIT} (sozinho numa linha) antes da pergunta final, que vai como uma segunda mensagem curta e natural. Respostas curtas (uma ou duas frases) vão numa mensagem só, sem ${BUBBLE_SPLIT}. Use no máximo um ${BUBBLE_SPLIT} por resposta.`,
].join("\n");
