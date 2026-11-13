import "server-only";
import { prisma } from "@/lib/prisma";
import { storeErpCode } from "@/lib/stores";
import { matchProducts, type IndexedProduct } from "@/lib/ai/catalog-search";
import { broadCatalogMatches, catalogBrands, resolveBrandQuery, specificSearchScope, type BrandEntry } from "@/lib/ai/brand-resolve";
import { expandModelNicknames } from "@/lib/ai/product-names";
import { buildStockResult, createStockClient, STOCK_MAX_CODES, stockSearchTerms, type StockLog, type StockLookup, type StockToolResult, type StoreInfo } from "@/lib/ai/stock";
import { buildShowcaseResult, classifySearch, showcaseCandidates, type ShowcaseResult } from "@/lib/ai/stock-showcase";

/** API de estoque do VMSet no host (scripts/vmset-stock-api.py), alcançada pelo container via host-gateway. */
const client = createStockClient({
  url: process.env.VMSET_STOCK_URL?.trim() || "http://host.docker.internal:9005",
  token: process.env.VMSET_STOCK_TOKEN?.trim() ?? "",
});
/** Espelho das filiais do ERP vistas nas consultas de estoque (código → nome da filial no VMSet). */
const erpUnits = new Map<string, string>();
export const getStockByProductCodes: typeof client.getStockByProductCodes = async (codes) => {
  const lookup = await client.getStockByProductCodes(codes);
  for (const units of Object.values(lookup.byCode)) for (const unit of units) if (unit.unit && unit.name) erpUnits.set(unit.unit.replace(/^0+(?=\d)/, ""), unit.name);
  return lookup;
};

/** Filiais do ERP já vistas no estoque (inclui as que ainda não têm cadastro de loja no CRM). */
export function erpUnitDirectory(): Map<string, string> {
  return erpUnits;
}

/** Saldo de mais códigos que o limite por chamada (5): lotes em paralelo, resultado unido; falha só se todos falharem. */
export async function getStockInBatches(codes: string[]): Promise<StockLookup> {
  const unique = [...new Set(codes)];
  const batches: string[][] = [];
  for (let index = 0; index < unique.length; index += STOCK_MAX_CODES) batches.push(unique.slice(index, index + STOCK_MAX_CODES));
  const results = await Promise.all(batches.map((batch) => getStockByProductCodes(batch)));
  const ok = results.filter((result) => result.stockStatus === "ok");
  return {
    stockStatus: ok.length ? "ok" : "unavailable_api",
    byCode: Object.assign({}, ...results.map((result) => result.byCode)),
    fromCache: results.reduce((sum, result) => sum + result.fromCache, 0),
    requested: results.reduce((sum, result) => sum + result.requested, 0),
  };
}

/** Marcas do catálogo (lista em cache junto com o catálogo, que já fica em memória por alguns minutos). */
const brandCache = new WeakMap<IndexedProduct[], BrandEntry[]>();
function brandsOf(all: IndexedProduct[]) {
  let brands = brandCache.get(all);
  if (!brands) brandCache.set(all, (brands = catalogBrands(all)));
  return brands;
}

const STORES_MS = 10 * 60 * 1000;
let storesCache: { at: number; stores: Promise<Map<string, StoreInfo>> } | null = null;

/** Recarrega o cadastro de lojas na próxima consulta (pin salvo ou editado). */
export function clearStoreDirectory() {
  storesCache = null;
}

/** Lojas ativas do cadastro do CRM pelo código do ERP ("LJ 36 ..." → "36"). */
export function storeDirectory() {
  if (storesCache && Date.now() - storesCache.at < STORES_MS) return storesCache.stores;
  const load = prisma.store
    .findMany({ where: { active: true }, orderBy: { number: "asc" }, select: { id: true, name: true, address: true, addressNumber: true, neighborhoods: true, city: true, state: true, pinLat: true, pinLng: true } })
    .then((rows) => {
      const map = new Map<string, StoreInfo>();
      for (const row of rows) {
        const code = storeErpCode(row.name);
        // lat/lng = pin exato da loja (manual ou geocodificado por rua); o centro do bairro (Store.lat) é só para o raio de clientes.
        if (code && !map.has(code)) map.set(code, { id: row.id, name: row.name, address: row.address, addressNumber: row.addressNumber, neighborhood: row.neighborhoods[0] ?? null, city: row.city, state: row.state, lat: row.pinLat, lng: row.pinLng });
      }
      return map;
    });
  storesCache = { at: Date.now(), stores: load };
  load.catch(() => { storesCache = null; });
  return load;
}

/**
 * Tool consultarEstoqueProduto: busca textual local (catálogo do CRM, top 5) → saldo pontual no VMSet só desses códigos.
 * Nunca lança erro: falha ou lentidão da API vira o cenário "unavailable_api".
 */
export async function consultarEstoqueProduto(
  args: { termoBusca?: unknown; regiaoOuLoja?: unknown; tipoBusca?: unknown },
  deps: { products: () => Promise<IndexedProduct[]>; withPrices: boolean },
): Promise<{ result: StockToolResult | ShowcaseResult; log: StockLog }> {
  const started = Date.now();
  const term = typeof args.termoBusca === "string" ? args.termoBusca.slice(0, 80) : "";
  const region = typeof args.regiaoOuLoja === "string" ? args.regiaoOuLoja.slice(0, 60) : "";
  const [all, stores] = await Promise.all([deps.products().catch(() => [] as IndexedProduct[]), storeDirectory().catch(() => new Map<string, StoreInfo>())]);

  // Marca com erro de digitação ("rada" → RADDA, "okley" → OAKLEY): marca inteira normalizada ou com 1-2 erros.
  const brands = brandsOf(all);
  const brandMatch = resolveBrandQuery(term, brands);
  // Busca ampla (só marca/categoria): vitrine de modelos distintos com estoque, sem lojas nem foto.
  const kind = brandMatch && !brandMatch.rest.length ? "marca_ampla" : classifySearch(brandMatch ? [brandMatch.brand, ...brandMatch.rest].join(" ") : term, args.tipoBusca, brands.map((entry) => entry.brand));
  if (kind === "marca_ampla") {
    const broad = broadCatalogMatches(all, term, brands);
    const groups = showcaseCandidates(broad.products.map((product) => ({ code: product.code!, description: product.description, brand: product.brand })));
    const lookup = groups.length ? await getStockInBatches(groups.flat().map((product) => product.code)) : null;
    const result = buildShowcaseResult({ term, groups, lookup, stores, withPrices: deps.withPrices, brand: broad.brand });
    const log: StockLog = { term, region, scenario: result.cenario, products: result.modelos.length, stores: 0, ms: Date.now() - started, cached: !!lookup && lookup.requested === 0, kind };
    console.log(`[ai][estoque] "${term}" (busca ampla): ${log.scenario}, ${log.products} modelos, ${log.ms} ms`);
    return { result, log };
  }

  let found: IndexedProduct[] = [];
  // Marca reconhecida: procura só na família dela, com o nome real ("okley holbrook" → "OAKLEY holbrook").
  const scope = specificSearchScope(all, term, brands);
  // Apelido do modelo vira a referência do ERP ("Ray-Ban Justin" → "Ray-Ban RB4165").
  for (const terms of stockSearchTerms(expandModelNicknames(scope.term))) {
    found = matchProducts(scope.pool, { label: term, category: "", terms }, STOCK_MAX_CODES).filter((product) => product.code);
    if (found.length) break;
  }
  const lookup = found.length ? await getStockByProductCodes(found.map((product) => product.code!)) : null;
  const result = buildStockResult({
    term,
    region,
    products: found.map((product) => ({ code: product.code!, description: product.description, brand: product.brand, price: product.price })),
    lookup,
    stores,
    withPrices: deps.withPrices,
  });
  const log: StockLog = {
    term,
    region,
    scenario: result.cenario,
    products: result.produtos.length,
    stores: new Set(result.produtos.flatMap((product) => product.lojasComEstoque.map((store) => store.code))).size,
    ms: Date.now() - started,
    cached: !!lookup && lookup.requested === 0,
    kind,
  };
  console.log(`[ai][estoque] "${term}"${region ? ` (${region})` : ""}: ${log.scenario}, ${log.products} produtos, ${log.stores} lojas, ${log.ms} ms${log.cached ? " (cache)" : ""}`);
  return { result, log };
}
