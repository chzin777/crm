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

/**
 * Referência apresentável ou null: vazio, só hífen/pontuação, "N/A", "null", "undefined" ou prefixo do ERP sem
 * código ("DO -", "DO") não viram "(Ref. ...)".
 */
export function cleanReference(value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text || /^(n\/?a|null|undefined|sem ref(erencia)?|-+)$/i.test(text)) return null;
  // Tokens só de pontuação saem ("DO -" → "DO"); prefixo "DO" do ERP sem código também.
  const tokens = text.split(" ").filter((token) => /[\p{L}\p{N}]/u.test(token));
  const useful = (tokens[0]?.toUpperCase() === "DO" ? tokens.slice(1) : tokens).join(" ").replace(/^[^\p{L}\p{N}#]+|[^\p{L}\p{N}]+$/gu, "");
  const alnum = useful.replace(/[^\p{L}\p{N}]/gu, "");
  if (alnum.length < 2 || /^(n\/?a|null|undefined)$/i.test(useful)) return null;
  return useful;
}

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
    referencia: codes.length ? cleanReference(codes.join(" ")) : null,
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
export function cardOpening(customerText: string, variant = 0) {
  // Variações para não repetir a mesma abertura a cada ficha da conversa (variant = nº de respostas da IA).
  const options = asksAvailability(customerText)
    ? [AVAILABILITY_OPENING, "Tem sim! 😊", "Temos, sim! Olha só: 😊"]
    : [DETAILS_OPENING, "Claro! Olha ele aqui: 😊", "Separei os detalhes pra você: 😊"];
  return options[Math.abs(variant) % options.length];
}

/** Ficha no padrão exato: abertura, 🕶️ nome | ref, Ⓜ️ modelo, 👓 armação, ✨ acabamento, 💵 valor, 📦 estoque, 📍 lojas. */
export function buildProductCard(fields: ProductCardFields, opening: string = AVAILABILITY_OPENING) {
  const stores = fields.lojasDisponiveis.filter((store) => store.quantidade > 0);
  const total = plainQty(fields.totalUnidades);
  const isLens = /lente/i.test(fields.categoriaModelo ?? "");
  const lines = [
    opening,
    "",
    `🕶️ *${fields.nomeComercial}${cleanReference(fields.referencia) ? ` | Ref. ${cleanReference(fields.referencia)}` : ""}*`,
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
  // Sem abertura (o comentário é do modelo): a ficha começa direto no nome do produto.
  if (!opening.trim()) return lines.slice(2).filter(Boolean).join("\n");
  return lines.filter((line, index) => line !== "" || index === 1).join("\n");
}

/** Pergunta de condução padrão da 2ª bolha. */
export const CARD_QUESTION = "Gostaria de reservar essa peça ou saber mais detalhes sobre o modelo?";

/** Regra fixa do prompt: o card do produto segue o template exato; com fichaFormatada, copie sem alterar. */
export const PRODUCT_CARD_TEMPLATE = [
  "FICHA DE PRODUTO (dado do sistema): quando consultarEstoqueProduto trouxer fichaFormatada, ela é a ficha real do modelo (nome, modelo, armação, acabamento, valor e lojas com estoque) e vai como legenda da foto.",
  "- Escreva antes dela um comentário curto, com suas palavras, ligado ao que a pessoa disse (confirmar que tem, apresentar o modelo que ela pediu ou escolheu); depois copie fichaFormatada exatamente como veio, sem reescrever nem acrescentar linhas.",
  "- Se couber, uma pergunta leve de próximo passo (reservar, provar na loja, receber a localização) após ---SPLIT---, escrita do zero e concordando com o número de lojas da ficha; não force pergunta.",
  "- Nunca escreva atributos sem dado (nada de não informado) nem invente lojas, quantidades ou preços.",
].join("\n");

/** Nome bruto do ERP no texto ("OCS RAY BAN REF 0RB4165L 622/7157"): tipo + marca + REF + referência/cor/tamanho. */
const ERP_NAME = /\b(?:OCS|ARM|OCULOS(?:\s+SOLAR)?|ARMACAO)\s+[A-Z][A-Z0-9&'.\- ]*?\s+REF[-.:]?\s*[0-9A-Z][0-9A-Z/.\- ]*[0-9A-Z]/g;

/** Nome comercial limpo para o cliente: "OCS RAY BAN REF 0RB4165L 622/7157" → "Ray-Ban Justin RB4165L". */
export function customerProductName(description: string, brand?: string | null) {
  const name = commercialName(description, brand);
  if (name.nomeComercial === description.trim()) return description.trim();
  const ref = name.referencia && !name.nomeComercial.toUpperCase().replace(/[^A-Z0-9]/g, "").includes(name.referencia.toUpperCase().replace(/[^A-Z0-9]/g, "")) ? ` ${name.referencia}` : "";
  return `${name.nomeComercial}${ref}`;
}

/** Troca qualquer nome bruto do VMSET que escapou na resposta pelo nome comercial (nunca código interno ao cliente). */
export function humanizeErpMentions(text: string) {
  return text.replace(ERP_NAME, (raw) => customerProductName(raw));
}
