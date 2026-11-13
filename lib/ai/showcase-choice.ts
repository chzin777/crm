/**
 * Vitrine da sessão atual (listedProducts): a lista numerada que a IA mostrou na busca ampla, lida das mensagens
 * DESTA sessão, e a escolha do cliente por número, posição, referência ou preço. Sem banco nem rede.
 */

export type ListedProduct = { index: number; sku: string | null; referencia: string | null; nomeComercial: string; preco: number | null };
export type ListedChoice = { type: "item"; item: ListedProduct } | { type: "ambiguous"; items: ListedProduct[]; price: number } | null;

const norm = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const compact = (value: string) => norm(value).replace(/[^a-z0-9]/g, "");
const money = (text: string) => Number(text.replace(/[^\d,]/g, "").replace(",", "."));

/** "1. 👓 *Radda (Ref. JC60020)* — R$ 120,00" (vitrine numerada montada no código). */
const SHOWCASE_LINE = /^\s*(\d{1,2})[.)]\s*[^*\n]*\*([^*\n]+?)\*(?:\s*[—–-]\s*(?:a partir de\s*)?(R\$\s*[\d.]+(?:,\d{2})?))?/;

/** Itens de uma mensagem com vitrine numerada (vazio se a mensagem não for uma vitrine). */
export function parseShowcase(text: string): ListedProduct[] {
  const items: ListedProduct[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(SHOWCASE_LINE);
    if (!match) continue;
    const name = match[2].trim();
    const ref = name.match(/\s*\(Ref\.\s*([^)]+)\)\s*$/);
    const referencia = ref ? ref[1].trim() : null;
    items.push({
      index: Number(match[1]),
      sku: referencia?.startsWith("#") ? referencia.slice(1) : null,
      referencia,
      nomeComercial: ref ? name.slice(0, ref.index).trim() : name,
      preco: match[3] ? money(match[3]) : null,
    });
  }
  // Só lista de verdade: numeração 1..N em ordem.
  return items.length >= 1 && items.every((item, position) => item.index === position + 1) ? items : [];
}

/** Vitrine mais recente das mensagens da IA nesta sessão (mais antigas primeiro). */
export function extractListedProducts(aiTexts: string[]): ListedProduct[] {
  for (let index = aiTexts.length - 1; index >= 0; index -= 1) {
    const items = parseShowcase(aiTexts[index]);
    if (items.length) return items;
  }
  return [];
}

const ORDINALS: Record<string, number> = { primeir: 1, segund: 2, terceir: 3, quart: 4, quint: 5, sext: 6, setim: 7, oitav: 8 };

/** Posição pedida: "o 1", "número 2", "esse primeiro", "o segundo", "o último" ou a mensagem só com o número. */
export function choicePosition(text: string, count: number): number | null {
  const value = norm(text).trim();
  const alone = value.match(/^(?:o|a)?\s*(\d{1,2})\s*[.!?]*$/);
  const numbered = value.match(/\b(?:o|a|n[º°o]?|numero|item|opcao|op)\s*\.?\s*(\d{1,2})(?!\s*(?:reais|,|\.\d|\d))\b/);
  const ordinal = value.match(/\b(?:o|a|esse|essa|este|esta|do|da|no|na|pelo|pela|ver)\s+(?:ai\s+)?(primeir|segund|terceir|quart|quint|sext|setim|oitav)[oa]\b|\b(\d)\s*[º°]/);
  const last = /\b(?:o|a|esse|essa|do|da)\s+ultim[oa]\b/.test(value);
  let position: number | null = null;
  if (alone) position = Number(alone[1]);
  else if (ordinal) position = ordinal[1] ? ORDINALS[ordinal[1]] : Number(ordinal[2]);
  else if (last) position = count;
  else if (numbered) position = Number(numbered[1]);
  return position && position >= 1 && position <= count ? position : null;
}

/** Preço citado: "esse de 120 ai", "o de R$ 1.290", "por 830". */
export function choicePrice(text: string): number | null {
  const match = norm(text).match(/(?:\bde\b|\bpor\b|r\$)\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d{2,6})(?:,(\d{2}))?(?!\s*(?:%|x\b|vezes))/);
  if (!match) return null;
  const value = Number(match[1].replace(/\./g, "")) + (match[2] ? Number(match[2]) / 100 : 0);
  return value >= 10 ? value : null;
}

/**
 * Escolha do cliente na vitrine desta sessão: referência citada > posição/número > preço. Preço que serve para
 * mais de um item é ambíguo (a IA pergunta qual número/referência, sem repetir a lista).
 */
export function resolveListedChoice(text: string, listed: ListedProduct[]): ListedChoice {
  if (!listed.length || !text.trim()) return null;
  const hay = compact(text);
  const byRef = listed.filter((item) => {
    const ref = compact((item.referencia ?? "").replace(/^#/, ""));
    return ref.length >= 3 && hay.includes(ref);
  });
  if (byRef.length === 1) return { type: "item", item: byRef[0] };
  const position = choicePosition(text, listed.length);
  if (position) return { type: "item", item: listed[position - 1] };
  const price = choicePrice(text);
  if (price === null) return null;
  const same = listed.filter((item) => item.preco !== null && (Math.abs(item.preco - price) < 0.01 || Math.floor(item.preco) === Math.floor(price)));
  if (same.length === 1) return { type: "item", item: same[0] };
  if (same.length > 1) return { type: "ambiguous", items: same, price };
  return null;
}

const brl = (value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Marca comum dos itens (1ª palavra do nome comercial) para a pergunta. */
function brandOf(items: ListedProduct[]) {
  const first = items.map((item) => item.nomeComercial.split(" ")[0]);
  return first.every((word) => word === first[0]) ? first[0] : "";
}

/** Pergunta natural quando o preço serve para vários itens: número ou referência, sem repetir a vitrine. */
export function ambiguousChoiceQuestion(items: ListedProduct[], price: number) {
  const brand = brandOf(items);
  const examples = items.slice(0, 2).map((item) => `o ${item.index}${item.referencia ? ` - Ref. ${item.referencia}` : ""}`).join(", ou ");
  return `Vários desses modelos${brand ? ` ${brand}` : ""} estão por ${brl(price)}! Qual número ou referência você quer ver primeiro? (ex.: ${examples})`;
}

/** Pergunta da trava anti-loop: a vitrine já foi enviada; escolher pelo número ou referência. */
export function pickFromListQuestion(listed: ListedProduct[]) {
  const examples = listed.slice(0, 2).map((item) => `o ${item.index}${item.referencia ? ` - Ref. ${item.referencia}` : ""}`).join(", ou ");
  return `É só me dizer o número ou a referência do modelo da lista que você quer ver (ex.: ${examples}) que eu te mando a foto e os detalhes! 😊`;
}

/** Termo da busca específica do item escolhido: nome comercial + referência exata da vitrine. */
export function listedSearchTerm(item: ListedProduct) {
  return [item.nomeComercial, item.referencia && !item.referencia.startsWith("#") ? item.referencia : item.sku].filter(Boolean).join(" ");
}

/** A resposta repete a vitrine já enviada (2+ itens numerados iguais aos da lista). */
export function repeatsShowcase(reply: string, listed: ListedProduct[]) {
  const again = parseShowcase(reply);
  if (again.length < 2) return false;
  return again.filter((item) => listed.some((old) => compact(old.nomeComercial + (old.referencia ?? "")) === compact(item.nomeComercial + (item.referencia ?? "")))).length >= 2;
}

/** O cliente pediu a lista de novo ou outros modelos (aí a vitrine pode sair outra vez). */
export function asksListAgain(text: string) {
  return /\b(lista|de novo|novamente|outros modelos|mais modelos|outras op[cç][oõ]es|todos os modelos|quais (os )?modelos)\b/i.test(text);
}

/** Regra fixa do prompt com a vitrine desta sessão (dados da sessão atual). */
export function listedPromptBlock(listed: ListedProduct[], choice: ListedChoice) {
  if (!listed.length) return "";
  const lines = ["VITRINE JÁ ENVIADA NESTA SESSÃO (listedProducts, ordem exibida):", ...listed.map((item) => `${item.index}. ${item.nomeComercial}${item.referencia ? ` (Ref. ${item.referencia})` : ""}${item.preco !== null ? ` — ${brl(item.preco)}` : ""}`)];
  if (choice?.type === "item") lines.push(`O cliente escolheu o item ${choice.item.index}: chame consultarEstoqueProduto com tipoBusca "modelo_especifico" e termoBusca "${listedSearchTerm(choice.item)}" e responda com a ficha completa (foto, detalhes e lojas). NÃO repita a vitrine.`);
  else if (choice?.type === "ambiguous") lines.push(`O preço citado serve para os itens ${choice.items.map((item) => item.index).join(", ")}: pergunte qual número ou referência ele quer ver, sem repetir a vitrine.`);
  else lines.push("Não chame marca_ampla de novo para a mesma marca nem repita essa lista: se o cliente escolher pelo número, posição, referência ou preço, abra o item com modelo_especifico.");
  return lines.join("\n");
}
