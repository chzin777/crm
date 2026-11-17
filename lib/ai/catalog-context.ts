import { explicitBrand, normalizeBrandQuery, normalizeTerm } from "@/lib/ai/catalog-search";

export type CatalogContext = { preferredCity: string; brand: string; category: string; lastCatalogFilterHash: string };
export const EMPTY_CATALOG_CONTEXT: CatalogContext = { preferredCity: "", brand: "", category: "", lastCatalogFilterHash: "" };

const CITY_ALIASES: [string, string][] = [
  ["aparecida de goiania", "Aparecida de Goiânia"], ["caldas novas", "Caldas Novas"],
  ["rio verde", "Rio Verde"], ["goiania", "Goiânia"], ["gyn", "Goiânia"],
  ["brasilia", "Brasília"], ["taguatinga", "Taguatinga"], ["anapolis", "Anápolis"], ["df", "DF"],
];
const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function canonicalCity(city: string): string {
  const key = plain(city).replace(/\s+/g, " ").trim();
  return CITY_ALIASES.find(([alias]) => alias === key)?.[1] ?? city.trim();
}

export function extractPreferredCity(text: string, cities: string[]): string | null {
  const source = plain(text);
  const candidates = [...CITY_ALIASES, ...cities.filter(Boolean).map((city): [string, string] => [plain(city), city])];
  const matches: { city: string; index: number; score: number; length: number }[] = [];
  for (const [alias, city] of candidates) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|[^a-z0-9])(${escaped})(?=$|[^a-z0-9])`, "g");
    for (const match of source.matchAll(regex)) {
      const index = (match.index ?? 0) + match[1].length;
      const before = source.slice(Math.max(0, index - 45), index);
      const after = source.slice(index + alias.length, index + alias.length + 30);
      if (/\b(nao|exceto|menos|fora de)\s*$/.test(before) || /^\s*(e|fica|esta)\s+(muito\s+)?longe\b/.test(after)) continue;
      const score = /\b(estou|moro|sou|somente|apenas|so|quero|preciso|retirar|comprar)(?:\s+\w+){0,4}\s*$/.test(before) ? 2 : 1;
      matches.push({ city: canonicalCity(city), index, score, length: alias.length });
    }
  }
  matches.sort((a, b) => b.score - a.score || a.index - b.index || b.length - a.length);
  return matches[0]?.city ?? null;
}

export function sanitizeCatalogContext(value: unknown): CatalogContext {
  if (!value || typeof value !== "object") return { ...EMPTY_CATALOG_CONTEXT };
  const raw = value as Record<string, unknown>;
  const field = (key: string) => typeof raw[key] === "string" ? raw[key].slice(0, 100) : "";
  return { preferredCity: field("preferredCity"), brand: field("brand"), category: field("category"), lastCatalogFilterHash: field("lastCatalogFilterHash") };
}

export function isBroadBrandRequest(text: string, brand: string): boolean {
  const wordsOf = (value: string) => plain(value).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const brandWords = new Set(wordsOf(brand));
  const filler = new Set(["QUERO", "QUERIA", "GOSTARIA", "PROCURO", "PRECISO", "PEDI", "PRESENTE", "PRESENTEAR", "PRESENTEANDO", "MINHA", "MEU", "ESPOSA", "ESPOSO", "MULHER", "MARIDO", "PARA", "PRA", "SABER", "COMPRAR", "VOCES", "VOCE", "VC", "VCS", "POR", "FAVOR", "TEM", "TERIAM", "DISPONIVEL", "ALGUMA", "ALGUM", "UMA", "UM", "O", "A", "OS", "AS", "DE", "DA", "DO", "E", "MARCA", "MODELO", "MODELOS", "ARMACAO", "ARMACOES", "OCULOS", "GRAU", "SOL", "SOLAR", "FEMININA", "FEMININAS", "MASCULINA", "MASCULINAS"]);
  const words = wordsOf(normalizeBrandQuery(text));
  return words.every((word) => brandWords.has(word) || filler.has(word));
}

export function updateCatalogContext(previous: CatalogContext, text: string, cities: string[]) {
  const city = extractPreferredCity(text, cities);
  const brand = explicitBrand(text);
  const words = plain(text);
  const category = /\b(lente|lentes)\s+de\s+contato\b/.test(words) ? "LENTE_CONTATO" : /\b(sol|solar|solares)\b/.test(words) ? "SOLAR" : /\b(armacao|armacoes|grau)\b/.test(words) ? "ARMACAO" : "";
  const context = { ...previous, preferredCity: city ?? previous.preferredCity, brand: brand ?? previous.brand, category: category || previous.category };
  const correction = /\b(errou|errado|errada|corrigiu|corrigir|correcao|na verdade)\b/i.test(plain(text)) || (!!brand && /\bpedi\b/i.test(plain(text)));
  const changed = !!city || (!!brand && normalizeTerm(brand) !== normalizeTerm(previous.brand)) || !!category || correction;
  return { context, changed, brand, city, correction };
}

export type PriceSort = "price_asc" | "price_desc" | "relevance";
export type Budget = { minPrice?: number; maxPrice?: number };

const money = (value: string) => {
  const number = Number(value.replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(number) && number > 0 && number < 100_000 ? number : undefined;
};
const MONEY = String.raw`(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{2,5}(?:,\d{1,2})?)\s*(?:reais|real|conto|contos|pila|r\$)?`;

/** Faixa de valor dita pelo cliente: "até 250 reais" → max 250; "entre 200 e 400" → 200–400; "acima de 500" → min 500. */
export function extractBudget(text: string): Budget {
  const source = plain(text);
  const range = source.match(new RegExp(String.raw`\b(?:entre|de)\s+${MONEY}\s*(?:e|a|ate)\s+${MONEY}`));
  if (range) {
    const [low, high] = [money(range[1]), money(range[2])];
    if (low && high) return { minPrice: Math.min(low, high), maxPrice: Math.max(low, high) };
  }
  const max = source.match(new RegExp(String.raw`\b(?:ate|no maximo|menos de|abaixo de|nao passe de|por volta de|em torno de|uns)\s+${MONEY}`));
  const min = source.match(new RegExp(String.raw`\b(?:acima de|mais de|a partir de|minimo de|pelo menos)\s+${MONEY}`));
  const budget: Budget = {};
  const maxPrice = max ? money(max[1]) : undefined;
  const minPrice = min ? money(min[1]) : undefined;
  if (maxPrice) budget.maxPrice = maxPrice;
  if (minPrice) budget.minPrice = minPrice;
  return budget;
}

/** "barata", "em conta", "mais acessível", "melhor preço": vitrine começa pelas opções de entrada. */
export function wantsCheap(text: string) {
  return /\b(barat[oa]s?|baratinh[oa]s?|em conta|mais acessive(l|is)|acessive(l|is)|melhor preco|menor preco|preco bom|preco baixo|economic[oa]s?|nao muito car[oa])\b/.test(plain(text));
}

/** Pedido para ver produtos de uma categoria/marca ("armação de grau barata", "tem óculos de sol?", "quero uma Ray-Ban"). */
export function isProductBrowseRequest(text: string) {
  const source = plain(text);
  return /\b(armac(ao|oes)|oculos|grau|solar|de sol|lentes? de contato)\b/.test(source) || !!explicitBrand(text) || wantsCheap(text);
}

/**
 * Pergunta de localização (e de orçamento, quando o pedido foi genérico) para quando a cidade ainda é desconhecida.
 * Variada pelo número da resposta para não soar repetida.
 */
export function cityQuestion(input: { askBudget: boolean; variant?: number }) {
  const city = [
    "Me conta de qual cidade você fala? Assim já separo os modelos disponíveis pertinho de você.",
    "De qual cidade (ou bairro) você é? Quero te mostrar só o que tem numa loja perto de você.",
    "Pra eu já separar opções numa loja pertinho, de qual cidade você está falando?",
  ];
  const budget = [
    " E tem uma faixa de valor em mente, tipo até uns R$ 200, R$ 300?",
    " E mais ou menos quanto você quer investir? Até uns R$ 200, R$ 300?",
    " Ah, e qual faixa de valor fica boa pra você?",
  ];
  const index = Math.abs(input.variant ?? 0) % city.length;
  return `${city[index]}${input.askBudget ? budget[index] : ""}`;
}

/** A resposta já pergunta onde o cliente está. */
export function asksCustomerCity(reply: string) {
  return /\b(cidade|bairro|regiao|onde voce (esta|mora|fica)|de onde)\b/.test(plain(reply));
}
