import "server-only";
import { prisma } from "@/lib/prisma";
import { recordAiUsage } from "@/lib/ai/store";
import { matchProducts, type IndexedProduct } from "@/lib/ai/catalog-search";
import { retailStock, stockSearchTerms, STOCK_MAX_CODES } from "@/lib/ai/stock";
import { getStockByProductCodes, storeDirectory } from "@/lib/ai/stock-db";
import { humanizeProductName, modelKey, parseErpName } from "@/lib/ai/product-names";
import { buildDetailsResult, createProductDetailsService, detailsPrompt, ratingLabel, webSearchDetails, type DetailsToolResult, type DetailsVariation, type ProductDetails } from "@/lib/ai/product-details";

const DETAILS_MODEL = "gpt-5.4-mini";

/** Pesquisa na web com o modelo da OpenAI; o consumo entra no painel de uso da IA como "product-details". */
const searchDetails = createProductDetailsService({
  cache: {
    get: (key) => prisma.productDetailCache.findUnique({ where: { key } }),
    set: (row) => prisma.productDetailCache.upsert({ where: { key: row.key }, create: row, update: { query: row.query, details: row.details } }),
  },
  search: async (prompt) => {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;
    return webSearchDetails(prompt, {
      apiKey,
      model: DETAILS_MODEL,
      onUsage: (usage) => recordAiUsage({ feature: "product-details", model: DETAILS_MODEL, inputTokens: usage.input, outputTokens: usage.output, ok: usage.ok, ...(usage.ok ? {} : { error: "Pesquisa da ficha do produto falhou" }) }),
    });
  },
});

/** Registro mostrado no teste da página /ia. */
export type DetailsLog = { product: string; source: "cache" | "web" | "none"; variations: number; ms: number; rating?: string | null };

type CatalogItem = { code?: string | null; description: string; brand: string | null };

/** Ficha do modelo (mini-descrição, descrição detalhada, avaliação): cache de 30 dias por modelo, depois a web. */
export function productSheet(product: CatalogItem, colorCodes: string[] = []): Promise<ProductDetails> {
  const parsed = parseErpName(product.description, product.brand);
  const query = parsed.referencia ? `${[parsed.tipo, parsed.marca].filter(Boolean).join(" ")} ${parsed.referencia}` : humanizeProductName(product.description, product.brand);
  const key = modelKey(product.description, product.brand) ?? `sku:${product.code ?? query.toUpperCase()}`;
  return searchDetails(key, detailsPrompt(query, colorCodes));
}

/** Resumo para a ficha da 1ª consulta (vai junto do resultado de estoque). */
export async function productSummary(product: CatalogItem) {
  const details = await productSheet(product).catch(() => null);
  return { miniDescricao: details?.sheet?.miniDescricao ?? null, avaliacaoWeb: ratingLabel(details?.sheet?.avaliacaoWeb), formato: details?.sheet?.formato ?? null, acabamento: details?.sheet?.acabamento ?? null, source: details?.source ?? "none" };
}

/**
 * Tool buscarDetalhesProdutoWeb: acha o produto no catálogo do CRM, junta as cores do mesmo modelo com saldo no
 * VMSet e a ficha técnica da web (cache de 30 dias por modelo). Nunca lança erro.
 */
export async function buscarDetalhesProduto(args: { nomeProduto?: unknown; marca?: unknown; referencia?: unknown; codigo?: unknown }, deps: { products: () => Promise<IndexedProduct[]> }): Promise<{ result: DetailsToolResult; log: DetailsLog; product: { codigo: string; produto: string; marca: string | null } | null }> {
  const started = Date.now();
  const asked = [args.marca, args.nomeProduto, args.referencia].filter((value) => typeof value === "string" && value.trim()).join(" ").slice(0, 120);
  const term = asked.replace(/\b(arma[cç][aã]o|[oó]culos( de sol| de grau)?|ref\.?)\b|[()]/gi, " ").replace(/\s+/g, " ").trim();
  const all = await deps.products().catch(() => [] as IndexedProduct[]);

  // Produto fixado na sessão (activeProduct): o código do ERP decide, sem busca aproximada.
  let found: IndexedProduct | null = typeof args.codigo === "string" && args.codigo ? all.find((product) => product.code === args.codigo) ?? null : null;
  for (const terms of found ? [] : stockSearchTerms(term)) {
    found = matchProducts(all, { label: term, category: "", terms }, 1)[0] ?? null;
    if (found) break;
  }

  const key = found ? modelKey(found.description, found.brand) : null;
  const siblings = key ? all.filter((product) => product.code && modelKey(product.description, product.brand) === key).sort((a, b) => b.sales - a.sales) : [];
  const parsed = found ? parseErpName(found.description, found.brand) : null;
  const name = found ? humanizeProductName(found.description, found.brand) : (typeof args.nomeProduto === "string" ? args.nomeProduto.slice(0, 80) : term);

  // Cores do mesmo modelo com saldo nas lojas de varejo (API do VMSet aceita até 5 códigos por consulta).
  const codes = (siblings.length ? siblings : found?.code ? [found] : []).map((product) => product.code!).slice(0, STOCK_MAX_CODES);
  const [lookup, stores] = await Promise.all([codes.length ? getStockByProductCodes(codes).catch(() => null) : null, storeDirectory().catch(() => new Map())]);
  const variations: DetailsVariation[] = [];
  if (lookup?.stockStatus === "ok") {
    for (const code of codes) {
      const product = all.find((item) => item.code === code);
      if (!product) continue;
      const live = retailStock(lookup.byCode[code] ?? [], stores);
      variations.push({ nomeProduto: humanizeProductName(product.description, product.brand), cor: parseErpName(product.description, product.brand).cor, totalDisponivel: live.reduce((sum, store) => sum + store.quantidade, 0), lojas: live.slice(0, 4).map((store) => store.loja.split(" — ")[0]) });
    }
  }

  const colorCodes = siblings.map((product) => parseErpName(product.description, product.brand).cor).filter((cor): cor is string => !!cor);
  const details: ProductDetails = found
    ? await productSheet(found, colorCodes)
    : term ? await searchDetails(`q:${term.toUpperCase()}`, detailsPrompt(name)) : { text: null, sheet: null, source: "none" };

  const result = buildDetailsResult({
    nomeProduto: name,
    referencia: parsed?.referencia ?? (typeof args.referencia === "string" ? args.referencia.slice(0, 40) : null),
    found: !!found,
    details,
    variations,
    stock: !codes.length ? "sem_codigo" : lookup?.stockStatus === "ok" ? "ok" : "indisponivel",
  });
  // Foto: a versão com saldo (ou a encontrada) do modelo.
  const withStock = siblings.find((product) => variations.some((variation) => variation.totalDisponivel > 0 && variation.cor === parseErpName(product.description, product.brand).cor));
  const photo = withStock ?? found;
  const log: DetailsLog = { product: name, source: details.source, variations: result.variacoesEmEstoque.length, ms: Date.now() - started, rating: result.avaliacaoWeb };
  console.log(`[ai][detalhes] "${name}": ficha ${log.source}, ${log.variations} variações com saldo, ${log.ms} ms`);
  return { result, log, product: photo?.code ? { codigo: photo.code, produto: photo.description, marca: photo.brand } : null };
}
