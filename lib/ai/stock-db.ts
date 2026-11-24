import "server-only";
import { prisma } from "@/lib/prisma";
import { storeErpCode } from "@/lib/stores";
import { CATEGORY_FILTER, explicitBrand, isKidsProduct, mentionsKids, normalizeBrandQuery, matchIconicProducts, matchProducts, type IndexedProduct } from "@/lib/ai/catalog-search";
import { broadCatalogMatches, catalogBrands, isBrandFamily, resolveBrandQuery, specificSearchScope, type BrandEntry } from "@/lib/ai/brand-resolve";
import { expandModelNicknames } from "@/lib/ai/product-names";
import { buildStockResult, createStockClient, STOCK_MAX_CODES, stockSearchTerms, type StockLog, type StockLookup, type StockToolResult, type StoreInfo } from "@/lib/ai/stock";
import { buildShowcaseResult, classifySearch, modelWords, SHOWCASE_CODES_PER_MODEL, showcaseCandidates, stripSearchNoise, termCategory, type PriceFilter, type ShowcaseResult } from "@/lib/ai/stock-showcase";

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

/** Saldo em lotes: uma falha parcial impede afirmar que o modelo está esgotado. */
export async function getStockInBatches(codes: string[]): Promise<StockLookup> {
  const unique = [...new Set(codes)];
  const batches: string[][] = [];
  for (let index = 0; index < unique.length; index += STOCK_MAX_CODES) batches.push(unique.slice(index, index + STOCK_MAX_CODES));
  const results: StockLookup[] = [];
  for (let index = 0; index < batches.length; index += 4) {
    results.push(...await Promise.all(batches.slice(index, index + 4).map((batch) => getStockByProductCodes(batch))));
  }
  const ok = results.filter((result) => result.stockStatus === "ok");
  return {
    stockStatus: ok.length === results.length && ok.length > 0 ? "ok" : "unavailable_api",
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

const TYPE_CATEGORY: Record<string, "ARMACAO" | "SOLAR" | "LENTE_CONTATO"> = { grau: "ARMACAO", sol: "SOLAR", lente_contato: "LENTE_CONTATO" };
/** Modelos candidatos de uma busca sem marca (só tipo/orçamento) consultados no saldo do VMSet. */
const GENERIC_CANDIDATES = 30;
/** Segunda tentativa da busca geral de categoria quando os primeiros candidatos não têm saldo na cidade. */
const GENERIC_CANDIDATES_WIDE = 120;
/** Termo da vitrine de uma categoria inteira (cliente pediu só o tipo). */
const CATEGORY_WORD: Record<"ARMACAO" | "SOLAR" | "LENTE_CONTATO", string> = { ARMACAO: "armação", SOLAR: "óculos de sol", LENTE_CONTATO: "lentes de contato" };

function priceFilterOf(args: { minPrice?: unknown; maxPrice?: unknown; sortBy?: unknown; _pisoTicket?: unknown }): PriceFilter | undefined {
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined);
  const sortBy = args.sortBy === "price_asc" || args.sortBy === "price_desc" ? args.sortBy : undefined;
  // Ticket mínimo (configuração da IA) só quando o cliente não deu faixa nem pediu barato.
  const floor = !number(args.minPrice) && !number(args.maxPrice) && sortBy !== "price_asc" ? number(args._pisoTicket) : undefined;
  const filter: PriceFilter = { minPrice: number(args.minPrice), maxPrice: number(args.maxPrice), sortBy, ...(floor ? { floor } : {}) };
  return filter.minPrice || filter.maxPrice || filter.sortBy || filter.floor ? filter : undefined;
}

/**
 * Candidatos dentro do orçamento pelo preço de cadastro (o preço final é o da loja, conferido na vitrine).
 * "Barata": mais baratos primeiro; senão, os mais vendidos (variados e aprovados pelos clientes).
 */
function orderByBudget(products: IndexedProduct[], price?: PriceFilter) {
  if (!price) return products;
  // Só o ticket mínimo: candidatos acima do piso primeiro (mais vendidos dentro de cada grupo), o resto depois.
  if (price.floor && !price.minPrice && !price.maxPrice && !price.sortBy) {
    const floor = price.floor * 0.85;
    return [...products.filter((product) => (product.price ?? 0) >= floor), ...products.filter((product) => (product.price ?? 0) < floor)];
  }
  // Folga de 15%: o preço da loja pode diferir um pouco do cadastro.
  const inRange = products.filter((product) => product.price === null || ((!price.maxPrice || product.price <= price.maxPrice * 1.15) && (!price.minPrice || product.price >= price.minPrice * 0.85)));
  if (price.sortBy === "price_asc") return [...inRange].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || b.sales - a.sales);
  if (price.sortBy === "price_desc") return [...inRange].sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity) || b.sales - a.sales);
  return inRange;
}

/**
 * Tool consultarEstoqueProduto: busca textual local (catálogo do CRM, top 5) → saldo pontual no VMSet só desses códigos.
 * Nunca lança erro: falha ou lentidão da API vira o cenário "unavailable_api".
 */
export async function consultarEstoqueProduto(
  args: { termoBusca?: unknown; regiaoOuLoja?: unknown; cidade?: unknown; tipoBusca?: unknown; marca?: unknown; nomeModelo?: unknown; referenciaOuSku?: unknown; textoVisivelNaImagem?: unknown; tipo?: unknown; minPrice?: unknown; maxPrice?: unknown; sortBy?: unknown; publicoInfantil?: unknown; _pisoTicket?: unknown; /** Modelos já mostrados na conversa (nunca repetir na vitrine). */ _excluir?: unknown },
  deps: { products: () => Promise<IndexedProduct[]>; withPrices: boolean },
): Promise<{ result: StockToolResult | ShowcaseResult; log: StockLog }> {
  const started = Date.now();
  const field = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const rawTerm = normalizeBrandQuery((field(args.termoBusca) || [field(args.marca), field(args.nomeModelo), field(args.referenciaOuSku)].filter(Boolean).join(" ")).slice(0, 80));
  const [all, stores] = await Promise.all([deps.products(), storeDirectory()]);
  // Cidade e ocasião no termo ("Goiânia" respondendo à pergunta da cidade, "sol pra presentear") não são produto:
  // saem do termo. Termo com referência (números, barras) fica intacto, a não ser que só sobre ruído.
  const noise = stripSearchNoise(rawTerm, [...stores.values()].map((store) => store.city ?? ""));
  const onlyWords = /^[\p{L}\s'-]*$/u.test(rawTerm);
  const term = noise.changed && (onlyWords || !modelWords(noise.term).length) ? noise.term : rawTerm;
  const city = (field(args.cidade) || noise.city || "").slice(0, 60);
  const region = typeof args.regiaoOuLoja === "string" ? args.regiaoOuLoja.slice(0, 60) : city;
  const price = priceFilterOf(args);
  const category = TYPE_CATEGORY[field(args.tipo)] ?? (termCategory(term) || termCategory(rawTerm));
  // Tipo pedido (grau/sol/lente de contato) restringe a vitrine também quando não há marca no termo.
  const inCategory = (product: IndexedProduct) => !category || product.categoryKey === CATEGORY_FILTER[category];
  // Público adulto por padrão: linhas infantis/juvenis só entram na vitrine quando o cliente falou de criança.
  const allowKids = args.publicoInfantil === true || mentionsKids(term);
  const inAudience = (product: IndexedProduct) => allowKids || !isKidsProduct(product);

  // Marca com erro de digitação ("rada" → RADDA, "okley" → OAKLEY): marca inteira normalizada ou com 1-2 erros.
  const brands = brandsOf(all);
  const requestedBrand = explicitBrand(field(args.marca) || term);
  const resolvedBrand = resolveBrandQuery(term, brands);
  const brandMatch = requestedBrand && resolvedBrand && !isBrandFamily(resolvedBrand.brand, requestedBrand) ? null : resolvedBrand;
  const identity = [term, field(args.nomeModelo), field(args.referenciaOuSku)].join(" ");
  const identityBrand = field(args.marca) || brandMatch?.brand;
  const iconic = matchIconicProducts(all, identity, identityBrand)
    ?? matchIconicProducts(all, field(args.textoVisivelNaImagem).slice(0, 4000), identityBrand);
  // Busca ampla (só marca/categoria): vitrine de modelos distintos com estoque, sem lojas nem foto.
  // Só tipo/orçamento ("armação até 250"): o valor no termo não é referência de modelo.
  const withoutValues = term.replace(/\b\d{2,5}(?:[.,]\d{2})?\b/g, " ").replace(/\s+/g, " ").trim();
  // O ticket mínimo (floor) não é pedido do cliente: não transforma busca de marca em busca por orçamento.
  const clientPrice = !!price && !!(price.minPrice || price.maxPrice || price.sortBy);
  const budgetOnly = !iconic && (clientPrice || !!field(args.tipo)) && !brandMatch?.rest.length && !modelWords(withoutValues).length;
  const kind = iconic ? "modelo_especifico" : budgetOnly || (brandMatch && !brandMatch.rest.length) ? "marca_ampla" : classifySearch(brandMatch ? [brandMatch.brand, ...brandMatch.rest].join(" ") : term, args.tipoBusca, brands.map((entry) => entry.brand));
  if (kind === "marca_ampla") {
    let broad = requestedBrand && !brandMatch ? { products: [] as IndexedProduct[], brand: requestedBrand as string | null } : broadCatalogMatches(all, budgetOnly ? withoutValues : term, brands, city || price || category ? all.length : undefined);
    // Sem marca e sem nenhum produto com as palavras do termo, mas com o tipo conhecido (sol/grau/lente): a vitrine
    // é a da categoria inteira (nunca "não encontrei" quando há centenas de modelos daquele tipo).
    const categoryOnly = !broad.brand && !requestedBrand && !!category && !broad.products.some(inCategory);
    if (categoryOnly) broad = broadCatalogMatches(all, CATEGORY_WORD[category], brands, all.length);
    // Sem marca (só tipo/orçamento) o catálogo é grande: limita os candidatos consultados no saldo.
    const generic = !broad.brand && (budgetOnly || categoryOnly || !modelWords(term).length);
    // A marca inteira pedida é infantil ("tem Sp Kids?"): aí o próprio pedido já é infantil.
    const audience = broad.brand && isKidsProduct({ brand: broad.brand }) ? broad.products : broad.products.filter(inAudience);
    const candidates = orderByBudget(audience.filter(inCategory), price);
    const exclude = Array.isArray(args._excluir) ? args._excluir.filter((id): id is string => typeof id === "string") : [];
    const showcase = async (groupLimit: number, showcaseCity: string) => {
      const limits = generic ? { groups: groupLimit, codesPerModel: SHOWCASE_CODES_PER_MODEL } : showcaseCity || price ? { groups: candidates.length, codesPerModel: candidates.length } : undefined;
      const groups = showcaseCandidates(candidates.map((product) => ({ code: product.code!, description: product.description, brand: product.brand })), limits);
      const lookup = groups.length ? await getStockInBatches(groups.flat().map((product) => product.code)) : null;
      return { lookup, result: buildShowcaseResult({ term: categoryOnly ? CATEGORY_WORD[category] : term, groups, lookup, stores, withPrices: deps.withPrices, brand: broad.brand, city: showcaseCity, price, exclude }) };
    };
    let { result, lookup } = await showcase(GENERIC_CANDIDATES, city);
    // Busca geral de categoria vazia na cidade (os primeiros candidatos não têm saldo lá): amplia os candidatos e,
    // se ainda assim nada, mostra o que a rede tem daquele tipo (a IA avisa que a loja confirma a disponibilidade).
    if (generic && city && result.cenario === "sem_estoque_na_cidade") {
      ({ result, lookup } = await showcase(GENERIC_CANDIDATES_WIDE, city));
      if (result.cenario === "sem_estoque_na_cidade") {
        const network = await showcase(GENERIC_CANDIDATES_WIDE, "");
        if (network.result.modelos.length) {
          ({ result, lookup } = network);
          result = { ...result, orientacao: `Não achei saldo desses modelos nas lojas de ${city} agora, mas a rede tem estas opções. Apresente com naturalidade e diga que a loja de ${city} confirma a disponibilidade ou providencia a transferência.`, foraDaCidade: true } as ShowcaseResult;
        }
      }
    }
    const log: StockLog = { term, region, scenario: result.cenario, products: result.modelos.length, stores: 0, ms: Date.now() - started, cached: !!lookup && lookup.requested === 0, kind };
    console.log(`[ai][estoque] busca ampla: ${log.scenario}, ${log.products} modelos, ${log.ms} ms`);
    return { result, log };
  }

  let found: IndexedProduct[] = [];
  // Marca reconhecida: procura só na família dela, com o nome real ("okley holbrook" → "OAKLEY holbrook").
  const scope = specificSearchScope(all, term, brands);
  // Apelido do modelo vira a referência do ERP ("Ray-Ban Justin" → "Ray-Ban RB4165").
  const sku = term.match(/(?:^|\s)#?(\d{5,})(?:\s|$)/)?.[1];
  const exactSku = sku ? all.find((product) => product.code === sku) : undefined;
  if (requestedBrand && !brandMatch) found = [];
  else if (exactSku && (!brandMatch || isBrandFamily(exactSku.brand, brandMatch.brand))) found = [exactSku];
  else if (exactSku) found = [];
  else if (iconic) found = iconic.products;
  else {
    const expanded = expandModelNicknames(scope.term);
    for (const search of [...new Set([scope.term, expanded])]) {
      for (const terms of stockSearchTerms(search).slice(0, field(args.nomeModelo) || field(args.referenciaOuSku) || brandMatch?.rest.length ? 2 : undefined)) {
        found = matchProducts(scope.pool, { label: term, category: "", terms }, city ? scope.pool.length : STOCK_MAX_CODES).filter((product) => product.code);
        if (found.length) break;
      }
      if (found.length) break;
    }
  }
  const lookup = found.length ? await getStockInBatches(found.map((product) => product.code!)) : null;
  const result = buildStockResult({
    term,
    region,
    city,
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
  console.log(`[ai][estoque] consulta: ${log.scenario}, ${log.products} produtos, ${log.stores} lojas, ${log.ms} ms${log.cached ? " (cache)" : ""}`);
  return { result, log };
}
