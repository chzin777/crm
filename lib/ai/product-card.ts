import { modelNickname, parseErpName } from "@/lib/ai/product-names";
import type { StockStore } from "@/lib/ai/stock";

/**
 * Ficha de produto no padrão visual do negócio (WhatsApp): montada no código a partir dos campos estruturados,
 * para a IA só copiar. Linhas sem dado confiável (formato, acabamento, valor) são omitidas. Sem banco nem rede.
 */

export type ProductCardStore = { loja: string; cidade: string | null; endereco: string | null; quantidade: number };
export type ProductCardFields = {
  nomeComercial: string;
  referencia: string | null;
  categoriaModelo: string | null;
  formatoArmacao: string | null;
  acabamentoOuMaterial: string | null;
  valorFormatado: string | null;
  totalUnidades: number;
  lojasDisponiveis: ProductCardStore[];
};

const CATEGORY: Record<string, string> = { "Armação": "Armação de grau", "Óculos de grau": "Armação de grau", "Óculos de sol": "Óculos de sol", "Lente de contato": "Lente de contato", "Óculos": "Óculos" };

/** "OCS RAY BAN REF-RB4165 JUSTIN 622/8G" → nome "Ray-Ban Justin", referência "RB4165", categoria "Óculos de sol". */
export function commercialName(description: string, brand?: string | null) {
  const parsed = parseErpName(description, brand);
  const tokens = (parsed.referencia ?? "").split(" ").filter(Boolean);
  // Prefixo interno da Luxottica ("0RB4165L" → "RB4165L").
  const codes = tokens.filter((token) => /\d/.test(token) || token.length <= 2).map((token) => token.replace(/^0(?=[A-Z]{2})/, ""));
  const fromErp = tokens.filter((token) => !/\d/.test(token) && token.length > 2);
  // Sem apelido no cadastro: nome comercial conhecido pela referência ("RB4165" → "Justin").
  const known = fromErp.length ? null : modelNickname(parsed.marca, codes.join(" "));
  const nickname = known ? [known] : fromErp;
  const name = [parsed.marca, ...nickname].filter(Boolean).join(" ").trim();
  return {
    nomeComercial: name || description.trim(),
    referencia: codes.length ? codes.join(" ") : null,
    categoriaModelo: parsed.tipo ? CATEGORY[parsed.tipo] ?? parsed.tipo : null,
  };
}

/** Loja do resultado de estoque ("Loja Setor Bueno — Av. T-8, 235", cidade) para a linha 📍 da ficha. */
export function cardStore(store: Pick<StockStore, "loja" | "quantidade" | "cidade">): ProductCardStore {
  const [name, address] = store.loja.split(" — ");
  return { loja: name.replace(/\s*\([^)]*\)\s*$/, "").trim(), cidade: store.cidade ?? null, endereco: address?.trim() || null, quantidade: store.quantidade };
}

const units = (count: number) => `${count} ${count === 1 ? "unidade disponível" : "unidades disponíveis"}`;
const plainQty = (value: number) => (Number.isInteger(value) ? value : Math.round(value * 100) / 100);
/** Quantidade da loja no fim da linha 📍 ("— 1 unidade", "— 2 unidades"). */
export const storeUnits = (count: number) => `${plainQty(count)} ${plainQty(count) === 1 ? "unidade" : "unidades"}`;

/** Abertura para pergunta de disponibilidade ("Vocês têm o Justin?"). */
export const AVAILABILITY_OPENING = "Temos sim! 😊";
/** Abertura para pedido de ver/detalhar um modelo ("Deixa eu ver esse Aviator", "Me mostra o Justin"). */
export const DETAILS_OPENING = "Aqui estão os detalhes desse modelo! 😊";

/** O cliente perguntou se existe/tem em estoque (e não só pediu para ver o modelo). */
export function asksAvailability(text: string) {
  return /(^|[^\p{L}])(tem|t[êe]m|tens|possui|possuem|vende|vendem|dispon[íi]ve(l|is)|estoque|ainda h[áa]|chegou)(?![\p{L}])/iu.test(text);
}

/** Abertura do card conforme a intenção: disponibilidade → "Temos sim! 😊"; ver/detalhar → apresentação. */
export function cardOpening(customerText: string) {
  return asksAvailability(customerText) ? AVAILABILITY_OPENING : DETAILS_OPENING;
}

/** Ficha no padrão exato: abertura, 🕶️ nome | ref, Ⓜ️ modelo, 👓 armação, ✨ acabamento, 💵 valor, 📦 estoque, 📍 lojas. */
export function buildProductCard(fields: ProductCardFields, opening: string = AVAILABILITY_OPENING) {
  const stores = fields.lojasDisponiveis.filter((store) => store.quantidade > 0);
  const total = plainQty(fields.totalUnidades);
  const isLens = /lente/i.test(fields.categoriaModelo ?? "");
  const lines = [
    opening,
    "",
    `🕶️ *${fields.nomeComercial}${fields.referencia ? ` | Ref. ${fields.referencia}` : ""}*`,
    fields.categoriaModelo ? `Ⓜ️ *Modelo:* ${fields.categoriaModelo}` : "",
    fields.formatoArmacao && !isLens ? `👓 *Armação:* ${fields.formatoArmacao}` : "",
    fields.acabamentoOuMaterial ? `✨ *Acabamento:* ${fields.acabamentoOuMaterial}` : "",
    fields.valorFormatado ? `💵 *Valor:* ${fields.valorFormatado}` : "",
    `📦 *Estoque:* ${units(total)} ${stores.length === 1 ? "na seguinte loja:" : "nas seguintes lojas:"}`,
    ...stores.map((store) => {
      const where = [store.cidade, store.endereco ? `(${store.endereco})` : ""].filter(Boolean).join(" ");
      return `📍 *${store.loja}*${where ? ` - ${where}` : ""} — ${storeUnits(store.quantidade)}`;
    }),
  ];
  return lines.filter((line, index) => line !== "" || index === 1).join("\n");
}

/** Pergunta de condução padrão da 2ª bolha. */
export const CARD_QUESTION = "Gostaria de reservar essa peça ou saber mais detalhes sobre o modelo?";

/** Regra fixa do prompt: o card do produto segue o template exato; com fichaFormatada, copie sem alterar. */
export const PRODUCT_CARD_TEMPLATE = [
  "FICHA DE PRODUTO (template visual obrigatório, vale antes e depois de o cliente entrar na fila): ao apresentar um modelo com estoque, a 1ª bolha segue EXATAMENTE este formato (vai como legenda da foto):",
  "Temos sim! 😊\n\n🕶️ *[Nome Comercial] | Ref. [Referência]*\nⓂ️ *Modelo:* [Categoria/Tipo]\n👓 *Armação:* [Formato]\n✨ *Acabamento:* [Material/Acabamento]\n💵 *Valor:* [Valor Formatado]\n📦 *Estoque:* [Total] unidade(s) disponível(is) na(s) seguinte(s) loja(s):\n📍 *[Nome da Loja]* - [Cidade] ([Endereço completo]) — [X] unidade(s)\n\n---SPLIT---\n\n[Pergunta curta de continuação, ex.: \"Gostaria de reservar essa peça ou saber mais detalhes sobre o modelo?\"]",
  "- ABERTURA CONFORME A INTENÇÃO: \"Temos sim! 😊\" só quando o cliente perguntou se existe/tem (\"Vocês têm o modelo X?\", \"Tem Ray-Ban Justin?\"). Quando ele pediu para ver ou saber mais de um modelo (\"Deixa eu ver esse...\", \"Me mostra o Aviator\", \"Quero saber mais sobre o Justin\"), abra com \"Aqui estão os detalhes desse modelo! 😊\" ou \"Claro! Confira os detalhes dele: 😊\"; NUNCA \"Temos sim! 😊\" nesse caso. A fichaFormatada já vem com a abertura certa.",
  "- Quando o resultado de consultarEstoqueProduto trouxer fichaFormatada, copie esse texto exatamente como veio (sem reescrever, sem acrescentar linhas) como 1ª bolha, depois ---SPLIT--- e a pergunta.",
  "- 1 loja: \"📦 *Estoque:* 1 unidade disponível na seguinte loja:\" (ou \"2 unidades disponíveis na seguinte loja:\") e uma linha 📍. 2 ou mais lojas: \"📦 *Estoque:* [total] unidades disponíveis nas seguintes lojas:\" e uma linha 📍 por loja. Cada linha 📍 termina com a quantidade exata daquela loja (campo quantidade): \"— 1 unidade\" no singular, \"— 2 unidades\" no plural. Ex.: \"📍 *Loja Setor Bueno* - Goiânia (Av. T 8 Esquina com Rua-27, 235) — 2 unidades\". Esta ficha substitui a lista agrupada por cidade.",
  "- Atributo sem dado (Armação, Acabamento, Valor): omita só aquela linha; nunca escreva \"Não informado\" ou \"N/A\".",
  "- Pergunta da 2ª bolha concorda com as lojas da ficha: 1 loja → singular (\"dessa loja\", \"nessa loja\"; ex.: \"Gostaria de reservar nessa loja ou receber a localização dela no mapa?\"); 2 ou mais → plural (\"de alguma dessas lojas\").",
].join("\n");
