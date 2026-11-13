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

/** Separadores aceitos: ---SPLIT--- (com variações de espaço, caixa e traços), [SPLIT] ou uma linha só com ---. */
const SPLIT_PATTERN = /\s*(?:-{2,}\s*split\s*-{2,}|\[\s*split\s*\]|(?:^|\n)[ \t]*-{3,}[ \t]*(?=\n|$))\s*/gi;

/** Pergunta de condução usada quando a IA lista lojas e esquece a segunda mensagem. */
export const DEFAULT_STORE_QUESTION = "Qual dessas lojas fica melhor pra você? Se preferir, me fala a região que eu te indico a mais próxima!";

const BULLET_LINE = /^\s*(?:[•*\-–]\s*)?\*?\s*(?:loja|unidade)\b/i;
const LIST_ITEM = /^\s*(?:[•\-–]|📍|\*\s)/;

/** A resposta lista lojas (📍 de cidade ou 2+ itens "• *Loja ..."). */
export function hasStoreList(text: string) {
  if (text.includes("📍")) return true;
  const lines = text.split("\n");
  return lines.filter((line) => BULLET_LINE.test(line) || /^\s*[•\-–]\s*\*[^*]+\*\s*[—–-]/.test(line)).length >= 2;
}

function cleanParts(text: string) {
  return text
    .split(SPLIT_PATTERN)
    .map((part) => part.replace(/-{2,}\s*split\s*-{2,}|\[\s*split\s*\]/gi, "").trim())
    .filter(Boolean);
}

/**
 * Bolhas da resposta da IA (WhatsApp e teste da /ia): corta no separador; se veio um bloco só com lista de lojas,
 * separa a pergunta final (último parágrafo/linha terminando em "?") ou, se a IA não fez pergunta, acrescenta a
 * pergunta de condução padrão como segunda mensagem. Nunca deixa o separador vazar.
 */
export function splitAiResponseMessages(text: string | null | undefined, max = MAX_BUBBLES): string[] {
  let parts = cleanParts(text ?? "");
  if (parts.length === 1 && hasStoreList(parts[0])) {
    const block = parts[0];
    const lines = block.split("\n");
    // Última linha não vazia: pergunta fora da lista vira a 2ª bolha (com o parágrafo inteiro, se for um parágrafo).
    let end = lines.length - 1;
    while (end > 0 && !lines[end].trim()) end -= 1;
    let start = end;
    while (start > 0 && lines[start - 1].trim() && !LIST_ITEM.test(lines[start - 1])) start -= 1;
    const tail = lines.slice(start, end + 1).join("\n").trim();
    const head = lines.slice(0, start).join("\n").trim();
    if (head && /\?\s*$/.test(tail) && !LIST_ITEM.test(lines[start]) && hasStoreList(head)) parts = [head, tail];
    else parts = [block, DEFAULT_STORE_QUESTION];
  }
  if (parts.length <= max) return parts;
  // Mais partes que o limite: as excedentes vão juntas na última bolha.
  return [...parts.slice(0, max - 1), parts.slice(max - 1).join("\n\n")];
}

/** Nome curto usado no restante do código. */
export const splitBubbles = splitAiResponseMessages;

/** Texto sem o separador (histórico, notas e contagem de caracteres). */
export function joinBubbles(text: string | null | undefined) {
  return cleanParts(text ?? "").join("\n\n");
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
  `- Nunca cole a pergunta de condução no fim de uma lista ou de uma resposta informativa longa: escreva ${BUBBLE_SPLIT} (sozinho numa linha) antes da pergunta final, que vai como uma segunda mensagem curta e natural. Respostas curtas (uma ou duas frases) vão numa mensagem só, sem ${BUBBLE_SPLIT}. Use no máximo um ${BUBBLE_SPLIT} por resposta.`,
  "REGRA OBRIGATÓRIA DE DUAS MENSAGENS: toda vez que você listar lojas disponíveis ou opções de produtos, a resposta DEVE terminar com o delimitador exato ---SPLIT--- (sozinho numa linha) seguido de uma segunda mensagem curta com uma pergunta natural de continuação (ex.: \"Qual dessas lojas fica mais fácil pra você ir?\" ou \"Se quiser, me diga qual loja fica melhor pra você que eu já confiro os modelos disponíveis lá!\"). Sem isso a resposta está incompleta.",
  "Formato obrigatório (exato):\nTemos o *Ray-Ban Meta* disponível nestas unidades:\n\n📍 *Goiânia*\n• *Loja Setor Bueno* — Av. T-8 esq. com Rua 27, 235\n• *Loja Setor Marista* — Rua 135 esq. com Av. Americano do Brasil, 208\n\n---SPLIT---\n\nQual dessas lojas fica melhor pra você? Assim já te passo os detalhes do modelo certo!",
].join("\n");
