import "server-only";
import { prisma } from "@/lib/prisma";
import { indexProduct, matchProducts, type CatalogSearch, type IndexedProduct, type SearchStep } from "@/lib/ai/catalog-search";
import { isRetailUnit, retailStock, storeLabel } from "@/lib/ai/stock";
import { getStockByProductCodes, storeDirectory } from "@/lib/ai/stock-db";

const DAYS = 730;
const MAX_PRODUCTS = 5;
const MAX_STORES = 3;
const CACHE_MS = 6 * 60 * 60 * 1000;

let cache: { at: number; products: Promise<IndexedProduct[]> } | null = null;

/**
 * Produtos distintos vendidos nos últimos 2 anos (sem serviços e lentes oftálmicas), em memória por 6h:
 * a busca casa os termos aqui em milissegundos em vez de varrer as vendas a cada pergunta. Traz o código do
 * produto no ERP, usado na consulta de saldo.
 */
export function catalogProducts() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.products;
  const load = prisma.$queryRaw<{ code: string | null; description: string; brand: string | null; category: string | null; subcategory: string | null; sales: number; price: number | null }[]>`
    SELECT max("productCode") AS code, btrim("description") AS description, max("brand") AS brand, max("category") AS category, max("subcategory") AS subcategory,
      COUNT(*)::int AS sales, round(avg("amount" / NULLIF("quantity", 0)), 2)::float8 AS price
    FROM "VmsetSale"
    WHERE "type" = 'Venda' AND "amount" > 0 AND NULLIF(btrim("description"), '') IS NOT NULL
      AND COALESCE("category", '') NOT ILIKE '%SERVI%' AND COALESCE("category", '') <> 'LENTES'
      AND "orderDate" >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - ${DAYS}::int
    GROUP BY 2
  `.then((rows) => rows.map(indexProduct));
  cache = { at: Date.now(), products: load };
  load.catch(() => { cache = null; });
  return load;
}

/** Lojas de varejo onde o produto foi vendido (fallback quando a API de estoque não responde). O código da venda é o "LJ" da loja. */
async function soldAt(descriptions: string[]) {
  const [rows, stores] = await Promise.all([
    prisma.$queryRaw<{ description: string; store: string | null; sales: number }[]>`
      SELECT btrim("description") AS description, "store", COUNT(*)::int AS sales
      FROM "VmsetSale"
      WHERE "type" = 'Venda' AND "amount" > 0 AND btrim("description") = ANY(${descriptions})
        AND "orderDate" >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - ${DAYS}::int
      GROUP BY 1, 2
      ORDER BY 3 DESC
    `,
    storeDirectory(),
  ]);
  const byProduct = new Map<string, string[]>();
  for (const row of rows) {
    const code = row.store?.trim().replace(/^0+(?=\d)/, "");
    const store = code ? stores.get(code) : undefined;
    if (!code || !store || !isRetailUnit(store.name)) continue;
    const list = byProduct.get(row.description) ?? [];
    const label = storeLabel(code, store);
    if (!list.includes(label) && list.length < MAX_STORES) list.push(label);
    byProduct.set(row.description, list);
  }
  return byProduct;
}

/**
 * Busca em cascata no catálogo (foto do produto): primeiro passo que achar produtos → saldo em tempo real por loja
 * na API do VMSet. Sem resposta da API, cai nas lojas onde o modelo foi vendido.
 */
export async function searchErpCatalog(steps: SearchStep[]): Promise<CatalogSearch | null> {
  const all = await catalogProducts();
  for (const step of steps) {
    const found = matchProducts(all, step, MAX_PRODUCTS);
    if (!found.length) continue;
    const codes = found.map((product) => product.code).filter((code): code is string => !!code);
    const [lookup, stores] = await Promise.all([codes.length ? getStockByProductCodes(codes) : null, storeDirectory()]);
    if (lookup?.stockStatus === "ok") {
      const results = found.map((product) => ({
        description: product.description, brand: product.brand, category: product.category, sales: product.sales, price: product.price,
        stores: retailStock(lookup.byCode[product.code ?? ""] ?? [], stores).slice(0, MAX_STORES).map((store) => store.loja),
      }));
      return { term: step.label, results, stock: "ok" };
    }
    const sold = await soldAt(found.map((product) => product.description));
    const results = found
      .map((product) => ({ description: product.description, brand: product.brand, category: product.category, sales: product.sales, price: product.price, stores: sold.get(product.description) ?? [] }))
      .filter((product) => product.stores.length);
    if (results.length) return { term: step.label, results, stock: "unavailable_api" };
  }
  return null;
}
