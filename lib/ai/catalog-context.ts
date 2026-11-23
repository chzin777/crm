import { explicitBrand, normalizeBrandQuery, normalizeTerm } from "@/lib/ai/catalog-search";

/** activeBrand: marca pedida que vale nos turnos seguintes (estilo, cidade) até o cliente trocar; brand é o mesmo valor. */
/** Item do último catálogo com fotos, na ordem exibida ("gostei da 2ª foto" → index 2), sem expor a referência. */
export type ShownProduct = { index: number; id: string; ref: string | null; name: string; price: number | null; stores: string[] };
export type CatalogContext = { preferredCity: string; brand: string; activeBrand: string; category: string; lastCatalogFilterHash: string; lastShownProducts?: ShownProduct[]; /** Códigos e referências-base de todos os modelos já mostrados na conversa (nunca repetir). */ shownIds?: string[] };

/** Até 120 identificadores: o mais recente fica no fim. */
export const MAX_SHOWN_IDS = 120;
export function rememberShown(context: CatalogContext, ids: string[]) {
  const next = [...(context.shownIds ?? []).filter((id) => !ids.includes(id)), ...ids].slice(-MAX_SHOWN_IDS);
  context.shownIds = next;
  return next;
}
export const EMPTY_CATALOG_CONTEXT: CatalogContext = { preferredCity: "", brand: "", activeBrand: "", category: "", lastCatalogFilterHash: "" };

function sanitizeShown(value: unknown): ShownProduct[] {
  if (!Array.isArray(value)) return [];
  const text = (raw: unknown, max: number) => (typeof raw === "string" ? raw.replace(/[\r\n]+/g, " ").trim().slice(0, max) : "");
  return value.slice(0, 8).flatMap((raw, position): ShownProduct[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const name = text(item.name, 100);
    if (!name) return [];
    return [{
      index: typeof item.index === "number" && item.index >= 1 ? Math.floor(item.index) : position + 1,
      id: text(item.id, 40), ref: text(item.ref, 40) || null, name,
      price: typeof item.price === "number" && Number.isFinite(item.price) ? item.price : null,
      stores: Array.isArray(item.stores) ? item.stores.map((store) => text(store, 60)).filter(Boolean).slice(0, 6) : [],
    }];
  });
}

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
  return matches[0]?.city ?? fuzzyCity(source, candidates);
}

/** Distância de edição com troca de letras vizinhas ("goianai" ↔ "goiania" = 1). */
function editDistance(a: string, b: string) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[a.length][b.length];
}

/**
 * Cidade digitada com erro ("Goiânai", "Brasila", "Anapolis", "aparecida de goiana"): compara palavras e pares de
 * palavras com os nomes da rede, tolerando 1 erro (2 em nomes longos). Só nomes com 6+ letras, para não confundir
 * palavras comuns com cidades.
 */
function fuzzyCity(source: string, candidates: [string, string][]): string | null {
  const words = source.split(/[^a-z0-9]+/).filter(Boolean);
  const grams = [...words, ...words.slice(1).map((word, index) => `${words[index]} ${word}`), ...words.slice(2).map((word, index) => `${words[index]} ${words[index + 1]} ${word}`)];
  let best: { city: string; distance: number; length: number } | null = null;
  for (const [alias, city] of candidates) {
    if (alias.length < 6) continue;
    const limit = alias.length >= 10 ? 2 : 1;
    for (const gram of grams) {
      if (Math.abs(gram.length - alias.length) > limit) continue;
      const distance = editDistance(gram, alias);
      if (distance > limit || distance === 0) continue;
      if (!best || distance < best.distance || (distance === best.distance && alias.length > best.length)) best = { city: canonicalCity(city), distance, length: alias.length };
    }
  }
  return best?.city ?? null;
}

export function sanitizeCatalogContext(value: unknown): CatalogContext {
  if (!value || typeof value !== "object") return { ...EMPTY_CATALOG_CONTEXT };
  const raw = value as Record<string, unknown>;
  const field = (key: string) => typeof raw[key] === "string" ? raw[key].slice(0, 100) : "";
  const brand = field("activeBrand") || field("brand");
  const shown = sanitizeShown(raw.lastShownProducts);
  const shownIds = Array.isArray(raw.shownIds) ? raw.shownIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 60).slice(-MAX_SHOWN_IDS) : [];
  return { preferredCity: field("preferredCity"), brand, activeBrand: brand, category: field("category"), lastCatalogFilterHash: field("lastCatalogFilterHash"), ...(shown.length ? { lastShownProducts: shown } : {}), ...(shownIds.length ? { shownIds } : {}) };
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
  const activeBrand = brand ?? (previous.activeBrand || previous.brand || "");
  const context: CatalogContext = { ...previous, preferredCity: city ?? previous.preferredCity, brand: activeBrand, activeBrand, category: category || previous.category };
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
export function cityQuestion(input: { askBudget?: boolean; variant?: number }) {
  // Uma pergunta só, simples (a faixa de valor fica para depois de cidade e tipo: ver qualificacao.md).
  const city = [
    "De qual cidade você fala, pra eu ver as lojas mais perto de você?",
    "De qual cidade você fala?",
    "Me conta de qual cidade você fala, pra eu ver o que tem pertinho de você?",
  ];
  return city[Math.abs(input.variant ?? 0) % city.length];
}

/** A resposta já pergunta onde o cliente está. */
export function asksCustomerCity(reply: string) {
  return /\b(cidade|bairro|regiao|onde voce (esta|mora|fica)|de onde)\b/.test(plain(reply));
}
