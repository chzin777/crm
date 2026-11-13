/**
 * Marca digitada errado pelo cliente ("rada", "okley", "carera", "guci") → marca real do catálogo do ERP
 * (RADDA, OAKLEY, CARRERA, GUCCI), sem cair em substring no meio de outro nome ("rada" dentro de "PRADA").
 * Normalização simplificada para PT-BR + distância de edição. Sem banco nem rede.
 */
import { matchProducts, type IndexedProduct } from "@/lib/ai/catalog-search";
import { modelWords, termAudience, termCategory } from "@/lib/ai/stock-showcase";

/**
 * Forma comparável: sem acento, hífen e espaço, minúscula, "ph"→"f", "y"→"i", "w"→"v" e letras repetidas
 * em sequência reduzidas ("RADDA" → "rada", "OAKLEY" → "oaklei", "Ray-Ban" → "raiban").
 */
export function normalizeSearchToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/ph/g, "f")
    .replace(/y/g, "i")
    .replace(/w/g, "v")
    .replace(/([a-z])\1+/g, "$1");
}

/** Distância de edição (inserção, remoção, troca) entre dois textos. */
export function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}

/** Erros aceitos: termo de até 3 letras só exato; 4-5 letras, 1 erro; 6 ou mais, 2 erros. */
export function maxTypos(length: number) {
  return length <= 3 ? 0 : length <= 5 ? 1 : 2;
}

export type BrandEntry = { brand: string; products: number };
export type BrandMatch = { brand: string; exact: boolean; /** Palavras do termo que não são a marca (modelo, referência). */ rest: string[] };

/** Marcas distintas do catálogo com a quantidade de produtos (desempate: a mais vendida/cadastrada). */
export function catalogBrands(products: { brand: string | null }[]): BrandEntry[] {
  const count = new Map<string, number>();
  for (const product of products) {
    const brand = product.brand?.trim();
    if (brand) count.set(brand, (count.get(brand) ?? 0) + 1);
  }
  return [...count.entries()].map(([brand, total]) => ({ brand, products: total })).sort((a, b) => b.products - a.products);
}

/** Marca com poucos produtos no catálogo só casa por nome exato. */
export const FUZZY_MIN_PRODUCTS = 5;

/** Palavras comuns de pedido que parecem marca com 1-2 erros ("prata" ~ PRADA, "titanio" ~ TIFFANY, "meta" ~ METZ). */
const COMMON_WORDS = new Set([
  "prata", "prateado", "prateada", "dourado", "dourada", "barato", "barata", "baratos", "menina", "menino", "meninas", "meninos", "titanio", "metal",
  "meta", "rosa", "preto", "preta", "azul", "verde", "branco", "branca", "vermelho", "vermelha", "marom", "nude", "tartaruga", "grande", "pequeno",
  "pequena", "leve", "novo", "nova", "novos", "novas", "original", "polarizado", "polarizada", "espelhado", "espelhada", "redondo", "redonda",
  "quadrado", "quadrada", "gatinho", "aviador", "oval", "leitura", "lancamento", "promocao", "masculino", "feminino", "unisex", "esportivo",
].map(normalizeSearchToken));

function bestBrand(candidate: string, brands: BrandEntry[]) {
  const key = normalizeSearchToken(candidate);
  if (!key) return null;
  // Referência (com número) e palavras comuns (cor, material, formato) nunca viram marca por aproximação.
  const fuzzy = !/\d/.test(key) && !COMMON_WORDS.has(key);
  // 1º: marca inteira idêntica na forma normalizada ("rada" = "RADDA", "rayban" = "RAY BAN").
  const exact = brands.find((entry) => normalizeSearchToken(entry.brand) === key);
  if (exact) return { brand: exact.brand, exact: true };
  if (!fuzzy) return null;
  // 2º: palavra inteira de uma única marca composta ("hilfiger" → TOMMY HILFIGER; "armani" é de 3 marcas: não).
  if (key.length >= 4) {
    const owners = brands.filter((entry) => entry.products >= FUZZY_MIN_PRODUCTS && entry.brand.split(/[^A-Za-z0-9]+/).some((word) => normalizeSearchToken(word) === key));
    if (owners.length === 1) return { brand: owners[0].brand, exact: false };
  }
  // 3º: marca inteira com até 1-2 erros de digitação (nunca substring no meio de outro nome); só marcas com
  // catálogo de verdade (evita "barato" → "RADDA TO" e "menina" → "MONICA").
  const limit = maxTypos(key.length);
  if (!limit) return null;
  let best: { brand: string; distance: number; products: number } | null = null;
  for (const entry of brands) {
    if (entry.products < FUZZY_MIN_PRODUCTS) continue;
    const brandKey = normalizeSearchToken(entry.brand);
    if (Math.abs(brandKey.length - key.length) > limit) continue;
    const distance = levenshtein(key, brandKey);
    if (distance <= limit && (!best || distance < best.distance || (distance === best.distance && entry.products > best.products))) best = { brand: entry.brand, distance, products: entry.products };
  }
  return best ? { brand: best.brand, exact: false } : null;
}

/**
 * Marca citada no termo: tenta as palavras juntas e depois trechos menores ("okley holbrook" → OAKLEY + "holbrook").
 * Ignora pedido/tipo/público ("tem", "óculos", "femininas"). Sem marca reconhecida → null.
 */
export function resolveBrandQuery(term: string, brands: BrandEntry[]): BrandMatch | null {
  const words = modelWords(term);
  for (let size = words.length; size >= 1; size -= 1) {
    for (let start = 0; start + size <= words.length; start += 1) {
      const window = words.slice(start, start + size);
      const found = bestBrand(window.join(""), brands);
      if (found) return { ...found, rest: [...words.slice(0, start), ...words.slice(start + size)] };
    }
  }
  return null;
}

/** O produto é da marca resolvida (ou de uma linha dela: "RADDA LEITURA", "RAY BAN JUNIOR"); "ESTOJO RADDA" não. */
export function isBrandFamily(productBrand: string | null, brand: string) {
  const own = (productBrand ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const wanted = brand.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  return !!wanted && (own === wanted || own.startsWith(`${wanted} `) || normalizeSearchToken(own) === normalizeSearchToken(wanted));
}

/** O termo inteiro é só uma palavra que aparece como palavra completa (não no meio de outra) no produto. */
export function hasWholeWord(text: string, word: string) {
  const key = normalizeSearchToken(word);
  return !!key && text.normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^A-Za-z0-9]+/).some((token) => normalizeSearchToken(token) === key);
}

/** Regra fixa do prompt: termo original do cliente na busca e confirmação natural da marca encontrada. */
export const BRAND_TYPO_RULES = [
  "MARCA COM ERRO DE DIGITAÇÃO (regra fixa): passe para consultarEstoqueProduto o termo como o cliente escreveu (ex.: \"rada\", \"okley\"), sem trocar por outra marca parecida; o sistema reconhece a marca certa.",
  "Quando o resultado trouxer marcaResolvida (ex.: cliente escreveu \"rada\" e a marca é RADDA), responda naturalmente com a marca encontrada (\"Temos vários modelos *RADDA* disponíveis em estoque! Confira alguns deles:\"), sem corrigir o cliente nem comentar o erro. Se vier semEstoqueDaMarca, diga com clareza que não há modelos dessa marca em estoque no momento e ofereça outras opções ou um atendente; nunca liste produtos de outras marcas como se fossem dela.",
].join("\n");

/**
 * Produtos da busca ampla: com marca reconhecida, só a família dela (nunca substring em outro nome); sem marca,
 * só produtos em que cada palavra aparece inteira ("ada" não casa com "PRADA"). Mais vendidos primeiro.
 */
export function broadCatalogMatches(all: IndexedProduct[], term: string, brands: BrandEntry[]) {
  const brand = resolveBrandQuery(term, brands);
  const words = modelWords(term);
  const pool = brand
    ? all.filter((product) => isBrandFamily(product.brand, brand.brand))
    : words.length
      ? all.filter((product) => words.every((word) => hasWholeWord(`${product.brand ?? ""} ${product.description}`, word)))
      : all;
  const found = matchProducts(pool, { label: term, category: termCategory(term), terms: [] }, 400).filter((product) => product.code);
  const audience = termAudience(term);
  const narrowed = audience ? found.filter((product) => product.text.includes(audience)) : found;
  return { brand: brand?.brand ?? null, products: narrowed.length ? narrowed : found };
}

/** Busca específica: com marca reconhecida, procura só na família dela usando o nome real da marca no termo. */
export function specificSearchScope(all: IndexedProduct[], term: string, brands: BrandEntry[]) {
  const brand = resolveBrandQuery(term, brands);
  if (!brand) return { brand: null, term, pool: all };
  return { brand: brand.brand, term: [brand.brand, ...brand.rest].join(" "), pool: all.filter((product) => isBrandFamily(product.brand, brand.brand)) };
}
