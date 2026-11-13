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

export type ImageProvider = "serper" | "google_cse";
export type ImageSearchConfig = { provider: ImageProvider; key: string; cx?: string } | null;

/** Provedor configurado no ambiente: SERPER_API_KEY ou GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX. */
export function imageSearchConfig(env: Record<string, string | undefined>): ImageSearchConfig {
  const serper = env.SERPER_API_KEY?.trim();
  if (serper) return { provider: "serper", key: serper };
  const key = env.GOOGLE_CSE_API_KEY?.trim();
  const cx = env.GOOGLE_CSE_CX?.trim();
  if (key && cx) return { provider: "google_cse", key, cx };
  return null;
}

export const IMAGE_PROVIDER_LABELS: Record<ImageProvider, string> = { serper: "Serper (Google Imagens)", google_cse: "Google Custom Search" };

const BRAND_NAMES: Record<string, string> = { RAYBAN: "Ray-Ban", "RAY-BAN": "Ray-Ban", OAKLEY: "Oakley", VOGUE: "Vogue", PRADA: "Prada", ARMANI: "Armani", "EMPORIO ARMANI": "Emporio Armani", CARRERA: "Carrera", "MICHAEL KORS": "Michael Kors", TOMMY: "Tommy Hilfiger", GUCCI: "Gucci", POLAROID: "Polaroid", JULIET: "Juliet" };

/**
 * Busca limpa a partir do ERP: marca + modelo/referência, sem cor/tamanho (601/8G, 54-17, 140) nem siglas internas.
 * Ex.: "RAYBAN RB4165 JUSTIN 601/8G 54" → "Ray-Ban RB4165 Justin óculos".
 */
export function imageQuery(product: { produto: string; marca?: string | null }) {
  const brandRaw = product.marca?.trim().toUpperCase() ?? "";
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
  return [brand, ...words.slice(0, 5), "óculos"].filter(Boolean).join(" ").trim();
}

const BLOCKED_HOSTS = /(^|\.)(facebook\.com|fbsbx\.com|fbcdn\.net|instagram\.com|cdninstagram\.com|tiktok\.com|x\.com|twitter\.com|pinimg\.com|gstatic\.com|googleusercontent\.com|lookaside\.)/i;

/** URL direta de imagem utilizável: https, .jpg/.jpeg/.png/.webp no caminho, sem base64, miniatura do Google nem rede social. */
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
  return /\.(jpe?g|png|webp)$/i.test(url.pathname);
}

export type ImageCandidate = { url: string; width?: number; height?: number };

/** Melhor candidata: URL direta, de bom tamanho; JPG/PNG antes de WebP (a Meta não envia WebP como foto). */
export function pickImage(candidates: ImageCandidate[]) {
  const valid = candidates.filter((item) => isDirectImageUrl(item.url) && (!item.width || item.width >= 250) && (!item.height || item.height >= 200));
  const score = (item: ImageCandidate) => (/\.webp$/i.test(new URL(item.url).pathname) ? 1 : 0);
  return [...valid].sort((a, b) => score(a) - score(b))[0]?.url ?? null;
}

type FetchLike = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Busca na web com limite de 3 s; sem chave, erro ou nada válido → null (a IA responde só em texto). */
export async function searchWebImage(query: string, config: ImageSearchConfig, deps: { fetch?: FetchLike; timeoutMs?: number } = {}): Promise<string | null> {
  if (!config || !query.trim()) return null;
  const doFetch: FetchLike = deps.fetch ?? ((url, init) => fetch(url, init));
  const signal = AbortSignal.timeout(deps.timeoutMs ?? IMAGE_SEARCH_TIMEOUT_MS);
  try {
    if (config.provider === "serper") {
      const response = await doFetch("https://google.serper.dev/images", {
        method: "POST",
        headers: { "X-API-KEY": config.key, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, gl: "br", hl: "pt-br", num: 10 }),
        signal,
      });
      if (!response.ok) throw new Error(`Serper ${response.status}`);
      const body = (await response.json()) as { images?: { imageUrl?: string; imageWidth?: number; imageHeight?: number }[] };
      return pickImage((body.images ?? []).map((item) => ({ url: item.imageUrl ?? "", width: item.imageWidth, height: item.imageHeight })));
    }
    const params = new URLSearchParams({ key: config.key, cx: config.cx ?? "", q: query, searchType: "image", num: "10", safe: "active", gl: "br" });
    const response = await doFetch(`https://www.googleapis.com/customsearch/v1?${params}`, { signal });
    if (!response.ok) throw new Error(`Google CSE ${response.status}`);
    const body = (await response.json()) as { items?: { link?: string; image?: { width?: number; height?: number } }[] };
    return pickImage((body.items ?? []).map((item) => ({ url: item.link ?? "", width: item.image?.width, height: item.image?.height })));
  } catch (error) {
    console.warn(`[ai][foto] busca "${query}" falhou: ${error instanceof Error ? error.message : error}`);
    return null;
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
export function createProductImageService(deps: { cache: ImageCache; search: (query: string) => Promise<string | null>; now?: () => number }) {
  const now = deps.now ?? Date.now;
  return async function searchAndCacheProductImage(product: { codigo: string; produto: string; marca?: string | null }): Promise<ProductImage | null> {
    const sku = product.codigo?.trim();
    if (!sku) return null;
    try {
      const cached = await deps.cache.get(sku);
      if (cached) {
        const age = now() - cached.updatedAt.getTime();
        if (cached.imageUrl && age < IMAGE_CACHE_TTL_MS) return { sku, url: cached.imageUrl, source: "cache", query: cached.query };
        if (!cached.imageUrl && age < IMAGE_MISS_TTL_MS) return null;
      }
      const query = imageQuery(product);
      const url = await deps.search(query);
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

/** Baixa a foto no servidor (confere se é JPG/PNG de até 5 MB e se o site não bloqueia) antes de mandar à Meta. */
export async function downloadImage(url: string, deps: { fetch?: (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>; timeoutMs?: number } = {}) {
  const doFetch = deps.fetch ?? ((target, init) => fetch(target, init));
  const response = await doFetch(url, { signal: AbortSignal.timeout(deps.timeoutMs ?? IMAGE_DOWNLOAD_TIMEOUT_MS), headers: { Accept: "image/jpeg,image/png;q=0.9" } });
  if (!response.ok) throw new Error(`download ${response.status}`);
  const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (mime !== "image/jpeg" && mime !== "image/png") throw new Error(`formato ${mime || "desconhecido"} não aceito como foto`);
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

/** Regra fixa do prompt quando a foto vai junto. */
export const IMAGE_CAPTION_RULE = [
  "FOTO DO PRODUTO (regra fixa): quando o resultado de consultarEstoqueProduto trouxer \"fotoAnexada\": true, o sistema envia a foto do produto junto com a sua resposta.",
  "- Escreva a resposta limpa e direta, para funcionar como legenda da foto (até ~900 caracteres): modelo, disponibilidade e lojas.",
  "- Nunca invente, cite ou escreva URLs de imagem; não diga \"segue o link\". Se o cliente pedir foto e não houver \"fotoAnexada\", diga que não tem a foto aqui agora e ofereça as informações.",
].join("\n");
