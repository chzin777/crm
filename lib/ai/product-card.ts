import { parseErpName } from "@/lib/ai/product-names";
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
  const nickname = tokens.filter((token) => !/\d/.test(token) && token.length > 2);
  const codes = tokens.filter((token) => /\d/.test(token) || token.length <= 2);
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

/** Ficha no padrão exato: saudação, 🕶️ nome | ref, Ⓜ️ modelo, 👓 armação, ✨ acabamento, 💵 valor, 📦 estoque, 📍 lojas. */
export function buildProductCard(fields: ProductCardFields) {
  const stores = fields.lojasDisponiveis.filter((store) => store.quantidade > 0);
  const total = plainQty(fields.totalUnidades);
  const isLens = /lente/i.test(fields.categoriaModelo ?? "");
  const lines = [
    "Temos sim! 😊",
    "",
    `🕶️ *${fields.nomeComercial}${fields.referencia ? ` | Ref. ${fields.referencia}` : ""}*`,
    fields.categoriaModelo ? `Ⓜ️ *Modelo:* ${fields.categoriaModelo}` : "",
    fields.formatoArmacao && !isLens ? `👓 *Armação:* ${fields.formatoArmacao}` : "",
    fields.acabamentoOuMaterial ? `✨ *Acabamento:* ${fields.acabamentoOuMaterial}` : "",
    fields.valorFormatado ? `💵 *Valor:* ${fields.valorFormatado}` : "",
    `📦 *Estoque:* ${units(total)} ${stores.length === 1 ? "na seguinte loja:" : "nas seguintes lojas:"}`,
    ...stores.map((store) => {
      const where = [store.cidade, store.endereco ? `(${store.endereco})` : ""].filter(Boolean).join(" ");
      return `📍 *${store.loja}*${where ? ` – ${where}` : ""}`;
    }),
  ];
  return lines.filter((line, index) => line !== "" || index === 1).join("\n");
}

/** Pergunta de condução padrão da 2ª bolha. */
export const CARD_QUESTION = "Gostaria de reservar essa peça ou saber mais detalhes sobre o modelo?";

/** Regra fixa do prompt: o card do produto segue o template exato; com fichaFormatada, copie sem alterar. */
export const PRODUCT_CARD_TEMPLATE = [
  "FICHA DE PRODUTO (template visual obrigatório, vale antes e depois de o cliente entrar na fila): ao apresentar um modelo com estoque, a 1ª bolha segue EXATAMENTE este formato (vai como legenda da foto):",
  "Temos sim! 😊\n\n🕶️ *[Nome Comercial] | Ref. [Referência]*\nⓂ️ *Modelo:* [Categoria/Tipo]\n👓 *Armação:* [Formato]\n✨ *Acabamento:* [Material/Acabamento]\n💵 *Valor:* [Valor Formatado]\n📦 *Estoque:* [X unidade(s)] disponível(is) na(s) seguinte(s) loja(s):\n📍 *[Nome da Loja]* – [Cidade] ([Endereço completo])\n\n---SPLIT---\n\n[Pergunta curta de continuação, ex.: \"Gostaria de reservar essa peça ou saber mais detalhes sobre o modelo?\"]",
  "- Quando o resultado de consultarEstoqueProduto trouxer fichaFormatada, copie esse texto exatamente como veio (sem reescrever, sem acrescentar linhas) como 1ª bolha, depois ---SPLIT--- e a pergunta.",
  "- 1 loja: \"📦 *Estoque:* 1 unidade disponível na seguinte loja:\" e uma linha 📍. 2 ou mais lojas: \"📦 *Estoque:* X unidades disponíveis nas seguintes lojas:\" e uma linha 📍 por loja. Esta ficha substitui a lista agrupada por cidade.",
  "- Atributo sem dado (Armação, Acabamento, Valor): omita só aquela linha; nunca escreva \"Não informado\" ou \"N/A\".",
].join("\n");
