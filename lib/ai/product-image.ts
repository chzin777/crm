/**
 * Foto do produto na web (o ERP não tem imagens): busca sob demanda pelo nome/referência oficial do ERP,
 * cache por código do produto (30 dias) e envio como imagem com legenda no WhatsApp, com volta para texto
 * se qualquer passo falhar. Sem banco aqui: cache, busca e envio entram por parâmetro (testável).
 */

export const IMAGE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Sem foto encontrada: não tenta de novo por 1 dia (economia da API paga). */
export const IMAGE_MISS_TTL_MS = 24 * 60 * 60 * 1000;
export const IMAGE_SEARCH_TIMEOUT_MS = 3_000;
export const IMAGE_DOWNLOAD_TIMEOUT_MS = 5_000;
/** Limite da Meta para imagem (5 MB) e para legenda (1024 caracteres). */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CAPTION_MAX = 1024;

export type ImageProvider = "serper" | "google_cse" | "free";
export type ImageSearchConfig = { provider: ImageProvider; key?: string; cx?: string };

/**
 * Provedor da busca: SERPER_API_KEY ou GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX quando configurados (opcionais, prioritários);
 * sem chave, a busca web gratuita (DuckDuckGo Imagens, com Bing Imagens de reserva) funciona sozinha.
 */
export function imageSearchConfig(env: Record<string, string | undefined>): ImageSearchConfig {
  const serper = env.SERPER_API_KEY?.trim();
  if (serper) return { provider: "serper", key: serper };
  const key = env.GOOGLE_CSE_API_KEY?.trim();
  const cx = env.GOOGLE_CSE_CX?.trim();
  if (key && cx) return { provider: "google_cse", key, cx };
  return { provider: "free" };
}

export const IMAGE_PROVIDER_LABELS: Record<ImageProvider, string> = { serper: "Serper (Google Imagens)", google_cse: "Google Custom Search", free: "Busca Web Gratuita (DuckDuckGo / Bing)" };

/** Cabeçalhos de navegador comum para a busca gratuita. */
export const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

const BRAND_NAMES: Record<string, string> = { RAYBAN: "Ray-Ban", "RAY-BAN": "Ray-Ban", OAKLEY: "Oakley", VOGUE: "Vogue", PRADA: "Prada", ARMANI: "Armani", "EMPORIO ARMANI": "Emporio Armani", CARRERA: "Carrera", "MICHAEL KORS": "Michael Kors", TOMMY: "Tommy Hilfiger", GUCCI: "Gucci", POLAROID: "Polaroid", JULIET: "Juliet" };

/**
 * Busca limpa a partir do ERP: marca + modelo/referência, sem cor/tamanho (601/8G, 54-17, 140) nem siglas internas.
 * Ex.: "RAYBAN RB4165 JUSTIN 601/8G 54" → "Ray-Ban RB4165 Justin óculos".
 */
export function imageQuery(product: { produto: string; marca?: string | null; categoria?: string | null }) {
  // Sem marca separada (catálogo: "Ray-Ban RB4340"), a marca vem do próprio nome em vez de ser descartada.
  const named = product.produto.split(/\s+/).map((word) => word.toUpperCase()).find((word) => BRAND_NAMES[word] !== undefined) ?? "";
  const brandRaw = product.marca?.trim().toUpperCase() || named;
  const brand = BRAND_NAMES[brandRaw] ?? (brandRaw ? brandRaw.charAt(0) + brandRaw.slice(1).toLowerCase() : "");
  const words = product.produto
    .replace(/[()[\]{}"',;]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !/[/\\]/.test(word) && !/^\d{1,3}(-\d{1,3})*$/.test(word) && !/^(OC|OCULOS|ÓCULOS|ARM|ARMACAO|ARMAÇÃO|SOL|GRAU|UN|UND|C\d+|COR)$/i.test(word))
    .filter((word) => {
      const upper = word.toUpperCase();
      return upper !== brandRaw && upper !== brandRaw.replace(/[\s-]/g, "") && BRAND_NAMES[upper] === undefined;
    })
    .map((word) => (/\d/.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()));
  // Tipo do produto na busca: a mesma referência existe em sol e grau (RB4340 x RX4340); sem ele vinha foto da armação.
  return [brand, ...words.slice(0, 5), CATEGORY_QUERY[photoCategory(product.categoria)]].filter(Boolean).join(" ").trim();
}

export type PhotoCategory = "sol" | "grau" | "";
/** Categoria do modelo ("Óculos de sol", "SOLAR", "Armação", "ARMACAO") → tipo da foto. */
export function photoCategory(categoria: string | null | undefined): PhotoCategory {
  const text = (categoria ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!text || /lente/.test(text)) return "";
  if (/\bsol\b|solar|sunglass/.test(text)) return "sol";
  if (/arma|grau|receitu|optical|eyeglass/.test(text)) return "grau";
  return "";
}
const CATEGORY_QUERY: Record<PhotoCategory, string> = { sol: "óculos de sol", grau: "armação óculos de grau", "": "óculos" };

const SUN_HINT = /sunglass|sun-glass|oculos-de-sol|oculos_de_sol|de-sol|solar|polarized|polarizad|\bsol\b/i;
const OPTICAL_HINT = /eyeglass|optical|opticals|oftalm|receituario|armacao|armacoes|\brx\d|[/_-]rx[/_-]|grau|clear-lens|demo-lens|prescription/i;

/**
 * Coerência foto x tipo: para óculos de sol descarta URLs que indicam armação de grau (eyeglasses, optical, RX) e
 * vice-versa; as que confirmam o tipo vêm primeiro. Sem tipo conhecido, mantém a ordem.
 */
export function rankByCategory(urls: string[], category: PhotoCategory) {
  if (!category) return urls;
  const decode = (url: string) => { try { return decodeURIComponent(url); } catch { return url; } };
  const fold = (url: string) => decode(url).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const [same, opposite] = category === "sol" ? [SUN_HINT, OPTICAL_HINT] : [OPTICAL_HINT, SUN_HINT];
  const allowed = urls.filter((url) => !(opposite.test(fold(url)) && !same.test(fold(url))));
  return [...allowed.filter((url) => same.test(fold(url))), ...allowed.filter((url) => !same.test(fold(url)))];
}

const BLOCKED_HOSTS = /(^|\.)(facebook\.com|fbsbx\.com|fbcdn\.net|instagram\.com|cdninstagram\.com|tiktok\.com|x\.com|twitter\.com|pinimg\.com|gstatic\.com|googleusercontent\.com|lookaside\.)/i;

/**
 * Origens proibidas (imagem ou página de origem): marketplaces, concorrentes, comparadores de preço, agregadores de
 * cupom/promoção e redes sociais, inclusive as CDNs deles. Um rótulo do domínio igual ao nome basta
 * ("media.pelando.com.br", "m.media-amazon.com", "http2.mlstatic.com").
 */
const BLOCKED_SOURCE_NAMES = [
  "amazon", "media-amazon", "ssl-images-amazon", "mercadolivre", "mercadolibre", "mlstatic", "shopee", "susercontent", "aliexpress", "alicdn",
  "shein", "ltwebstatic", "magazineluiza", "magalu", "mlcdn", "americanas", "casasbahia", "pontofrio", "extra", "submarino", "shoptime", "b2wdigital",
  "netshoes", "dafiti", "zattini", "kanui", "pelando", "promobit", "gatry", "zoom", "buscape", "bondfaro", "jacotei", "cuponomia", "meliuz", "mercadolivrecdn",
  "oticascarol", "chillibeans", "oticasdiniz", "oticagolden", "oticasgolden", "grandvision", "oticaswanny", "lojasrenner", "renner", "riachuelo", "cea",
  "pinterest", "pinimg", "instagram", "facebook", "fbcdn", "tiktok", "youtube", "ytimg", "olx", "enjoei", "ebay", "ebayimg", "walmart", "carrefour", "kabum",
];
const BLOCKED_SOURCE = new RegExp(`(^|[.-])(${BLOCKED_SOURCE_NAMES.join("|")})([.-]|$)`, "i");

/** Texto da página/resultado com cara de anúncio: preço, desconto, cupom, frete grátis ou nome de varejista. */
const PROMO_TEXT = /R\$|US\$|\$\s?\d|\d+\s?%\s?(off|de desconto)|\bpromo(c|ç)(a|ã)o\b|\bpromo\b|\bofertas?\b|\bcupo(m|ns|n)\b|frete\s+gr(a|á)tis|\bdesconto\b|\bliquida(c|ç)(a|ã)o\b|black\s*friday|\bpelando\b|\bamazon\b|mercado\s*livre|\bshopee\b|\baliexpress\b|\bmagalu\b|magazine\s*luiza|\bamericanas\b/i;

/** Domínios próprios (site/CDN da empresa): sempre na frente. */
const OWN_HOSTS = /(^|\.)oticasbrasil\.com\.br$/i;
/** Sites oficiais de fabricantes e distribuidores autorizados: logo depois dos próprios. */
const OFFICIAL_HOSTS = /(^|\.)(ray-ban\.com|rayban\.com|luxottica\.com|essilorluxottica\.com|oakley\.com|vogue-eyewear\.com|prada\.com|dolcegabbana\.com|armani\.com|safilo\.com|carreraworld\.com|polaroideyewear\.com|michaelkors\.com|tommy\.com|gucci\.com|versace\.com|burberry\.com|miumiu\.com|persol\.com|arnette\.com|costadelmar\.com|marchon\.com|kering\.com|keringeyewear\.com|marcolin\.com|tomford\.com|guess\.com|calvinklein\.com|hugoboss\.com|boss\.com|lacoste\.com|swarovski\.com|chanel\.com|dior\.com|celine\.com|fendi\.com|bulgari\.com|tiffany\.com|coach\.com|jimmychoo\.com|ralphlauren\.com|scene7\.com)$/i;

const hostOf = (raw: string | undefined) => {
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
};

/** Origem proibida (marketplace, concorrente, agregador ou rede social) pelo host da imagem ou da página. */
export function isBlockedImageSource(url: string | undefined) {
  const host = hostOf(url);
  return !!host && BLOCKED_SOURCE.test(host);
}

/** Resultado de busca aceitável: origem permitida e sem texto de anúncio (preço, oferta, cupom, varejista). */
export function isCleanImageResult(item: { url: string; pageUrl?: string; title?: string; source?: string }) {
  if (isBlockedImageSource(item.url) || isBlockedImageSource(item.pageUrl)) return false;
  let path = item.url;
  try {
    path = decodeURIComponent(item.url);
  } catch {
    /* URL com % solto: confere como veio */
  }
  const text = [item.title, item.source, item.pageUrl, path].filter(Boolean).join(" ").replace(/[-_]+/g, " ");
  return !PROMO_TEXT.test(text);
}

/** 0 = site próprio, 1 = fabricante oficial, 2 = demais lojas permitidas. */
export function imageSourceRank(item: { url: string; pageUrl?: string }) {
  const hosts = [hostOf(item.url), hostOf(item.pageUrl)];
  if (hosts.some((host) => OWN_HOSTS.test(host))) return 0;
  if (hosts.some((host) => OFFICIAL_HOSTS.test(host))) return 1;
  return 2;
}

/** Termos negativos na busca: tira marketplace, agregador e anúncio já na origem. */
export const NEGATIVE_QUERY_TERMS = "-amazon -pelando -mercadolivre -shopee -aliexpress -magalu -promocao -oferta -desconto -cupom";

/** URL direta de foto aceita pela Meta: https, .jpg/.jpeg/.png no caminho; sem WebP, SVG, base64, miniatura do Google nem rede social. */
export function isDirectImageUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 2000 || !raw.startsWith("https://")) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (BLOCKED_HOSTS.test(url.hostname) || /encrypted-tbn|[?&](w|width)=\d{1,2}(&|$)/i.test(raw)) return false;
  if (/(^|[/_-])(thumb|thumbnail|icon|logo|sprite|avatar)s?([/_.-]|$)/i.test(url.pathname)) return false;
  return /\.(jpe?g|png)$/i.test(url.pathname);
}

export type ImageCandidate = { url: string; width?: number; height?: number; pageUrl?: string; title?: string; source?: string };

/**
 * Candidatas válidas (URL direta JPG/PNG, de bom tamanho, sem repetir), sem marketplace/concorrente/agregador e sem
 * anúncio com preço; site próprio e fabricantes oficiais na frente.
 */
export function pickImages(candidates: ImageCandidate[], limit = 6) {
  const seen = new Set<string>();
  return candidates
    .filter((item) => isDirectImageUrl(item.url) && (!item.width || item.width >= 250) && (!item.height || item.height >= 200))
    .filter((item) => {
      if (isCleanImageResult(item)) return true;
      console.warn(`[ai][foto] resultado descartado (marketplace, concorrente ou anúncio com preço): ${hostOf(item.pageUrl) || hostOf(item.url)}`);
      return false;
    })
    .map((item, index) => ({ item, index, rank: imageSourceRank(item) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item.url)
    .filter((url) => (seen.has(url) ? false : (seen.add(url), true)))
    .slice(0, limit);
}

/** Melhor candidata (a primeira válida). */
export function pickImage(candidates: ImageCandidate[]) {
  return pickImages(candidates, 1)[0] ?? null;
}

type FetchLike = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

/** DuckDuckGo Imagens: token vqd da página de busca e resultados em /i.js (as duas chamadas dentro de 3 s). */
async function duckDuckGoImages(query: string, doFetch: FetchLike, timeoutMs: number) {
  const signal = AbortSignal.timeout(timeoutMs);
  const q = encodeURIComponent(query);
  const page = await doFetch(`https://duckduckgo.com/?q=${q}&iax=images&ia=images`, { headers: BROWSER_HEADERS, signal });
  if (!page.ok) throw new Error(`DuckDuckGo ${page.status}`);
  const vqd = (await page.text()).match(/vqd=["']?([\d-]+)/)?.[1];
  if (!vqd) throw new Error("DuckDuckGo sem token vqd");
  const response = await doFetch(`https://duckduckgo.com/i.js?l=br-pt&o=json&q=${q}&vqd=${vqd}&f=,,,,,&p=1`, { headers: { ...BROWSER_HEADERS, Referer: "https://duckduckgo.com/", Accept: "application/json" }, signal });
  if (!response.ok) throw new Error(`DuckDuckGo i.js ${response.status}`);
  const body = (await response.json()) as { results?: { image?: string; width?: number; height?: number; url?: string; title?: string; source?: string }[] };
  return pickImages((body.results ?? []).map((item) => ({ url: item.image ?? "", width: item.width, height: item.height, pageUrl: item.url, title: item.title, source: item.source })));
}

/** Bing Imagens (reserva): URLs originais ("murl") no HTML de /images/async, em até 3 s. */
async function bingImages(query: string, doFetch: FetchLike, timeoutMs: number) {
  const response = await doFetch(`https://www.bing.com/images/async?q=${encodeURIComponent(query)}&first=0&count=35&mmasync=1`, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Bing ${response.status}`);
  const html = (await response.text()).replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  // Cada resultado traz a foto (murl), a página de origem (purl) e o título (t) no mesmo bloco.
  return pickImages([...html.matchAll(/\{[^{}]*?"murl":"(.*?)"[^{}]*?\}/g)].map((match) => {
    const field = (name: string) => new RegExp(`"${name}":"(.*?)"`).exec(match[0])?.[1]?.replace(/\\\//g, "/");
    return { url: match[1].replace(/\\\//g, "/"), pageUrl: field("purl"), title: field("t") };
  }));
}

/** Busca gratuita sem chave: DuckDuckGo e, se falhar ou vier vazio, Bing. Nunca lança erro. */
export async function searchFreeImages(query: string, deps: { fetch?: FetchLike; timeoutMs?: number } = {}): Promise<string[]> {
  const doFetch: FetchLike = deps.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = deps.timeoutMs ?? IMAGE_SEARCH_TIMEOUT_MS;
  for (const [name, provider] of [["DuckDuckGo", duckDuckGoImages], ["Bing", bingImages]] as const) {
    try {
      const urls = await provider(query, doFetch, timeoutMs);
      if (urls.length) return urls;
    } catch (error) {
      console.warn(`[ai][foto] ${name} "${query}": ${error instanceof Error ? error.message : error}`);
    }
  }
  return [];
}

/**
 * Candidatas de foto na web (limite de 3 s por provedor): chave opcional (Serper/Google) primeiro; sem chave,
 * erro ou nada válido nela, a busca gratuita. Nada encontrado → [] (a IA responde só em texto).
 */
export async function searchWebImages(query: string, config: ImageSearchConfig, deps: { fetch?: FetchLike; timeoutMs?: number } = {}): Promise<string[]> {
  if (!query.trim()) return [];
  const filtered = `${query.trim()} ${NEGATIVE_QUERY_TERMS}`;
  if (config.provider !== "free") {
    const paid = await searchPaidImage(filtered, config, deps);
    if (paid.length) return paid;
  }
  return searchFreeImages(filtered, deps);
}

/** Primeira candidata (compatibilidade). */
export async function searchWebImage(query: string, config: ImageSearchConfig, deps: { fetch?: FetchLike; timeoutMs?: number } = {}): Promise<string | null> {
  return (await searchWebImages(query, config, deps))[0] ?? null;
}

async function searchPaidImage(query: string, config: ImageSearchConfig, deps: { fetch?: FetchLike; timeoutMs?: number }): Promise<string[]> {
  const doFetch: FetchLike = deps.fetch ?? ((url, init) => fetch(url, init));
  const signal = AbortSignal.timeout(deps.timeoutMs ?? IMAGE_SEARCH_TIMEOUT_MS);
  try {
    if (config.provider === "serper") {
      const response = await doFetch("https://google.serper.dev/images", {
        method: "POST",
        headers: { "X-API-KEY": config.key ?? "", "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, gl: "br", hl: "pt-br", num: 10 }),
        signal,
      });
      if (!response.ok) throw new Error(`Serper ${response.status}`);
      const body = (await response.json()) as { images?: { imageUrl?: string; imageWidth?: number; imageHeight?: number; link?: string; title?: string; source?: string; domain?: string }[] };
      return pickImages((body.images ?? []).map((item) => ({ url: item.imageUrl ?? "", width: item.imageWidth, height: item.imageHeight, pageUrl: item.link, title: item.title, source: [item.source, item.domain].filter(Boolean).join(" ") })));
    }
    const params = new URLSearchParams({ key: config.key ?? "", cx: config.cx ?? "", q: query, searchType: "image", num: "10", safe: "active", gl: "br" });
    const response = await doFetch(`https://www.googleapis.com/customsearch/v1?${params}`, { signal });
    if (!response.ok) throw new Error(`Google CSE ${response.status}`);
    const body = (await response.json()) as { items?: { link?: string; title?: string; snippet?: string; displayLink?: string; image?: { width?: number; height?: number; contextLink?: string } }[] };
    return pickImages((body.items ?? []).map((item) => ({ url: item.link ?? "", width: item.image?.width, height: item.image?.height, pageUrl: item.image?.contextLink, title: [item.title, item.snippet].filter(Boolean).join(" "), source: item.displayLink })));
  } catch (error) {
    console.warn(`[ai][foto] busca "${query}" (${config.provider}) falhou: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}

export type ImageCacheRow = { sku: string; query: string; imageUrl: string | null; source: string; updatedAt: Date };
export type ImageCache = {
  get: (sku: string) => Promise<ImageCacheRow | null>;
  set: (row: Omit<ImageCacheRow, "updatedAt">) => Promise<void>;
  invalidate: (sku: string) => Promise<void>;
};
export type ProductImage = { sku: string; url: string; source: "cache" | "web"; query: string };

/**
 * searchAndCacheProductImage: cache válido (30 dias) responde na hora, sem chamada externa; sem cache, busca na
 * web e grava (também grava "não achou" por 1 dia). Nunca lança erro.
 */
export function createProductImageService(deps: { cache: ImageCache; search: (query: string) => Promise<string[] | string | null>; validate?: (url: string) => Promise<boolean>; now?: () => number }) {
  const now = deps.now ?? Date.now;
  return async function searchAndCacheProductImage(product: { codigo: string; produto: string; marca?: string | null; categoria?: string | null }): Promise<ProductImage | null> {
    const sku = product.codigo?.trim();
    if (!sku) return null;
    try {
      const query = imageQuery(product);
      const category = photoCategory(product.categoria);
      const cached = await deps.cache.get(sku);
      // Foto gravada por uma busca sem o tipo (ou do tipo oposto) não vale para quem agora sabe o tipo: busca de novo.
      const staleKind = !!category && !!cached && !cached.query.includes(CATEGORY_QUERY[category]);
      // Foto antiga de marketplace/agregador/anúncio (ex.: arte do Pelando com preço): descartada e buscada de novo.
      const blocked = !!cached?.imageUrl && !isCleanImageResult({ url: cached.imageUrl });
      if (blocked) console.warn(`[ai][foto] ${sku}: foto em cache de origem proibida descartada (${hostOf(cached!.imageUrl!)})`);
      if (cached && !staleKind && !blocked) {
        const age = now() - cached.updatedAt.getTime();
        if (cached.imageUrl && age < IMAGE_CACHE_TTL_MS) return { sku, url: cached.imageUrl, source: "cache", query: cached.query };
        if (!cached.imageUrl && age < IMAGE_MISS_TTL_MS) return null;
      }
      const found = await deps.search(query);
      const candidates = rankByCategory((Array.isArray(found) ? found : found ? [found] : []).filter((candidate) => isCleanImageResult({ url: candidate })), category).slice(0, 3);
      // Só grava foto que baixa de verdade como JPG/PNG de até 5 MB (site sem bloqueio).
      let url: string | null = null;
      for (const candidate of candidates) {
        if (!deps.validate || (await deps.validate(candidate).catch(() => false))) { url = candidate; break; }
      }
      await deps.cache.set({ sku, query, imageUrl: url, source: url ? "web" : "miss" }).catch(() => undefined);
      return url ? { sku, url, source: "web", query } : null;
    } catch (error) {
      console.warn(`[ai][foto] ${sku}: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  };
}

/** Legenda da foto até 1024 caracteres (corta em parágrafo, frase ou palavra); o restante segue como texto. */
export function splitCaption(text: string, max = CAPTION_MAX) {
  const clean = text.trim();
  if (clean.length <= max) return { caption: clean, rest: "" };
  const head = clean.slice(0, max);
  const cut = [head.lastIndexOf("\n\n"), head.lastIndexOf("\n"), head.lastIndexOf(". ") + 1, head.lastIndexOf(" ")].find((index) => index > max * 0.5) ?? max;
  return { caption: clean.slice(0, cut).trim(), rest: clean.slice(cut).trim() };
}

/** Confere se a foto baixa como JPG/PNG de até 5 MB (nunca lança erro). */
export async function isUsableImage(url: string, deps: Parameters<typeof downloadImage>[1] = {}) {
  try {
    await downloadImage(url, { timeoutMs: IMAGE_SEARCH_TIMEOUT_MS, ...deps });
    return true;
  } catch (error) {
    console.warn(`[ai][foto] candidata descartada (${error instanceof Error ? error.message : error}): ${url.slice(0, 120)}`);
    return false;
  }
}

/** Baixa a foto no servidor (confere se é JPG/PNG de até 5 MB e se o site não bloqueia) antes de mandar à Meta. */
export async function downloadImage(url: string, deps: { fetch?: (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>; timeoutMs?: number } = {}) {
  const doFetch = deps.fetch ?? ((target, init) => fetch(target, init));
  const response = await doFetch(url, { signal: AbortSignal.timeout(deps.timeoutMs ?? IMAGE_DOWNLOAD_TIMEOUT_MS), headers: { ...BROWSER_HEADERS, Accept: "image/jpeg,image/png;q=0.9" } });
  if (!response.ok) throw new Error(`download ${response.status}`);
  const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (mime !== "image/jpeg" && mime !== "image/png") throw new Error(`formato ${mime || "desconhecido"} não aceito como foto`);
  // Tamanho declarado acima do limite: descarta sem baixar o arquivo inteiro (fotos oficiais chegam a 9 MB).
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > IMAGE_MAX_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`tamanho ${declared} bytes fora do limite`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 2_000 || bytes.length > IMAGE_MAX_BYTES) throw new Error(`tamanho ${bytes.length} bytes fora do limite`);
  return { bytes, mime, name: `produto.${mime === "image/png" ? "png" : "jpg"}` };
}

/**
 * Envio com volta automática: tenta a foto com legenda (e o restante do texto, se passar de 1024); se a foto
 * falhar (download, formato, recusa da Meta), invalida o cache daquele produto e manda a resposta em texto.
 */
export async function deliverImageOrText(
  deps: { sendImage: (caption: string) => Promise<unknown>; sendText: (text: string) => Promise<unknown>; invalidate: () => Promise<unknown> },
  text: string,
): Promise<"image" | "text"> {
  const { caption, rest } = splitCaption(text);
  try {
    await deps.sendImage(caption);
  } catch (error) {
    console.warn(`[ai][foto] envio da foto falhou, seguindo em texto: ${error instanceof Error ? error.message : error}`);
    await Promise.resolve().then(deps.invalidate).catch(() => undefined);
    await deps.sendText(text);
    return "text";
  }
  if (rest) await deps.sendText(rest);
  return "image";
}

