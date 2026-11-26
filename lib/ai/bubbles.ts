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
/** Mesma pergunta quando só 1 loja foi listada (concordância no singular). */
export const SINGLE_STORE_QUESTION = "Quer que eu te passe os detalhes técnicos completos desse modelo ou prefere a localização dessa loja?";

/** Pergunta de condução padrão conforme a quantidade de lojas listadas. */
export const storeQuestion = (count: number) => (count === 1 ? SINGLE_STORE_QUESTION : DEFAULT_STORE_QUESTION);

/**
 * Lojas listadas na bolha: linhas da ficha "📍 *Loja X* – cidade (...)" e itens "• *Loja X* — endereço".
 * Títulos de cidade ("📍 *Goiânia*", sem endereço) não contam.
 */
export function countStores(text: string) {
  return text.split("\n").filter((line) => /^\s*📍\s*\*[^*]+\*\s*[–—-]\s*\S/.test(line) || /^\s*[•\-–]\s*\*[^*]+\*\s*[—–-]\s*\S/.test(line) || /^\s*[•\-–]\s*\*?\s*(loja|unidade)\b/i.test(line)).length;
}

const SINGULAR: [RegExp, string][] = [
  [/\bem alguma dessas (lojas|unidades)\b/gi, "nessa loja"],
  [/\bde alguma dessas (lojas|unidades)\b/gi, "dessa loja"],
  [/\balguma dessas (lojas|unidades)\b/gi, "essa loja"],
  [/\bem uma dessas (lojas|unidades)\b/gi, "nessa loja"],
  [/\bdessas lojas\b/gi, "dessa loja"],
  [/\bnessas lojas\b/gi, "nessa loja"],
  [/\bdessas unidades\b/gi, "dessa unidade"],
  [/\bnessas unidades\b/gi, "nessa unidade"],
  [/\bessas lojas\b/gi, "essa loja"],
  [/\bessas unidades\b/gi, "essa unidade"],
];

/**
 * Concordância da pergunta com a quantidade de lojas da 1ª bolha: com 1 loja, "alguma dessas lojas" vira
 * "dessa loja" (o texto continua sendo o do modelo).
 */
export function agreeStoreCount(question: string, count: number) {
  if (count !== 1) return question;
  let text = question;
  for (const [pattern, singular] of SINGULAR) text = text.replace(pattern, (match) => (match[0] === match[0].toUpperCase() ? singular.charAt(0).toUpperCase() + singular.slice(1) : singular));
  return text;
}

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
/** Rede de segurança: o marcador de nome dos exemplos do prompt nunca chega ao cliente ("Boa tarde, <PRIMEIRO_NOME>!" → "Boa tarde!"). */
export function stripNamePlaceholder(text: string) {
  return text.replace(/,?\s*<\s*PRIMEIRO_NOME\s*>/gi, "");
}

export function splitAiResponseMessages(text: string | null | undefined, max = MAX_BUBBLES): string[] {
  const parts = splitParts(fixDoubleGreeting(stripNamePlaceholder(text ?? "")), max).map(tidyBubble).filter(Boolean);
  // Pergunta das bolhas seguintes concorda com a quantidade de lojas listadas na 1ª (1 loja → singular).
  const stores = parts.length > 1 ? countStores(parts[0]) : 0;
  return stores === 1 ? [parts[0], ...parts.slice(1).map((part) => agreeStoreCount(part, 1))] : parts;
}

/** Oferta/pergunta de próximo passo no início do parágrafo ("Se quiser, ...", "Quer que eu ...", "Posso te ..."). */
const OFFER_START = /^(se (quiser|preferir|precisar)|caso (queira|prefira)|quer que|posso (te|lhe|ver|verificar|enviar|mandar|passar|encaminhar|chamar|reservar)|voc[eê] (prefere|gostaria|quer)|prefere|gostaria|deseja|o que acha|me (avisa|diz|fala|conta))\b/i;
const OFFER_MAX = 300;

/** O parágrafo é uma pergunta ou oferta de continuação (vira a 2ª bolha). */
export function isFollowUp(paragraph: string) {
  const value = paragraph.trim();
  return !!value && value.length <= OFFER_MAX && !LIST_ITEM.test(value) && (/\?\s*\S{0,3}$/.test(value) || OFFER_START.test(value.replace(/^[*_~]+/, "")));
}

const PERIOD_GREETING = "(bom dia|boa tarde|boa noite)";
const INTERJECTION = "(oi+|ol[áa]|e a[íi])";

/**
 * Abertura única: corrige saudação dupla no início da resposta ("Boa tarde! Oi, Maria 😊" → "Boa tarde,
 * Maria 😊"; "Boa tarde! Oi! Tudo bem?" → "Boa tarde! Tudo bem?"; "Olá! Bom dia, Maria!" → "Bom dia, Maria!").
 */
export function fixDoubleGreeting(text: string) {
  // Fim de palavra sem \b (que não reconhece "á" de "Olá").
  const end = "(?=[\\s!,.?]|$)";
  const periodFirst = new RegExp(`^(\\s*)${PERIOD_GREETING}\\s*[!,.]?\\s+${INTERJECTION}${end}\\s*([!,.]?)\\s*`, "i");
  const interjectionFirst = new RegExp(`^(\\s*)${INTERJECTION}\\s*[!,.]?\\s+${PERIOD_GREETING}${end}`, "i");
  return text
    .replace(periodFirst, (_match, lead: string, greeting: string, _hi: string, punct: string) => `${lead}${greeting}${punct === "!" || punct === "." ? "! " : ", "}`)
    .replace(interjectionFirst, (_match, lead: string, _hi: string, greeting: string) => `${lead}${greeting.charAt(0).toUpperCase()}${greeting.slice(1)}`);
}

/**
 * Bolha sem buraco visual: no máximo uma linha em branco; mensagem curta (até 2 frases, sem lista) não tem linha
 * em branco entre as frases.
 */
export function tidyBubble(text: string) {
  const value = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const lines = value.split("\n");
  // Lista: lojas (📍), itens, numeração ou linhas da vitrine de modelos (🕶️/👓/👁️).
  const hasList = value.includes("📍") || lines.some((line) => LIST_ITEM.test(line) || /^\s*\d+[.)]\s/.test(line) || /^\s*(🕶|👓|👁)/u.test(line));
  const sentences = value.split(/(?<=[.!?…])\s+/).filter((part) => part.trim()).length;
  return !hasList && sentences <= 2 ? value.replace(/\s*\n\s*\n\s*/g, " ") : value;
}

function splitParts(text: string | null | undefined, max: number): string[] {
  let parts = cleanParts(text ?? "");
  // Sem ---SPLIT---: informação + pergunta/oferta no último parágrafo (separados por linha em branco) viram 2 bolhas.
  if (parts.length === 1 && !hasStoreList(parts[0])) {
    const paragraphs = parts[0].split(/\n[ \t]*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
    const last = paragraphs[paragraphs.length - 1];
    if (paragraphs.length >= 2 && isFollowUp(last)) parts = [paragraphs.slice(0, -1).join("\n\n"), last];
  }
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
    // Sem pergunta do modelo: a lista vai sozinha (nenhuma pergunta pronta é acrescentada pelo código).
    else parts = [block];
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
  deps: { sendFirst: (text: string) => Promise<unknown>; sendNext: (text: string) => Promise<unknown>; typing?: () => Promise<unknown>; sleep?: (ms: number) => Promise<void>; delay?: (next: string) => number },
) {
  if (!parts.length) return 0;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  await deps.sendFirst(parts[0]);
  for (const part of parts.slice(1)) {
    await Promise.resolve().then(() => deps.typing?.()).catch(() => undefined);
    await sleep(deps.delay ? deps.delay(part) : bubbleDelay());
    await deps.sendNext(part);
  }
  return parts.length;
}

