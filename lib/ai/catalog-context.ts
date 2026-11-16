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
