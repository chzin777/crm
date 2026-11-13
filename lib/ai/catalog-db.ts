import "server-only";
import { prisma } from "@/lib/prisma";
import { indexProduct, matchProducts, type CatalogSearch, type IndexedProduct, type SearchStep } from "@/lib/ai/catalog-search";

const DAYS = 730;
const MAX_PRODUCTS = 6;
const MAX_STORES = 3;
const CACHE_MS = 6 * 60 * 60 * 1000;

let cache: { at: number; products: Promise<IndexedProduct[]> } | null = null;

/**
 * Produtos distintos vendidos nos últimos 2 anos (sem serviços e lentes oftálmicas), em memória por 6h:
 * a busca casa os termos aqui em milissegundos em vez de varrer as vendas a cada foto.
 */
function products() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.products;
  const load = prisma.$queryRaw<{ description: string; brand: string | null; category: string | null; subcategory: string | null; sales: number; price: number | null }[]>`
    SELECT btrim("description") AS description, max("brand") AS brand, max("category") AS category, max("subcategory") AS subcategory,
      COUNT(*)::int AS sales, round(avg("amount" / NULLIF("quantity", 0)), 2)::float8 AS price
    FROM "VmsetSale"
    WHERE "type" = 'Venda' AND "amount" > 0 AND NULLIF(btrim("description"), '') IS NOT NULL
      AND COALESCE("category", '') NOT ILIKE '%SERVI%' AND COALESCE("category", '') <> 'LENTES'
      AND "orderDate" >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - ${DAYS}::int
    GROUP BY 1
  `.then((rows) => rows.map(indexProduct));
  cache = { at: Date.now(), products: load };
  load.catch(() => { cache = null; });
  return load;
}

/** "LJ 23 · Centro, Goiânia": número da loja do cadastro + bairro/cidade (a razão social não ajuda o cliente). */
async function storesFor(descriptions: string[]) {
  const rows = await prisma.$queryRaw<{ description: string; store: string | null; sales: number }[]>`
    SELECT btrim("description") AS description, "store", COUNT(*)::int AS sales
    FROM "VmsetSale"
    WHERE "type" = 'Venda' AND "amount" > 0 AND btrim("description") = ANY(${descriptions})
      AND "orderDate" >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - ${DAYS}::int
    GROUP BY 1, 2
    ORDER BY 3 DESC
  `;
  const numbers = [...new Set(rows.map((row) => Number(row.store)).filter(Number.isInteger))];
  const stores = numbers.length ? await prisma.store.findMany({ where: { number: { in: numbers }, active: true }, select: { number: true, name: true, neighborhoods: true, city: true } }) : [];
  const labels = new Map(stores.map((store) => [String(store.number), [store.name.match(/^LJ\s*\d+/i)?.[0] ?? store.name, [store.neighborhoods[0], store.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ")]));
  const byProduct = new Map<string, string[]>();
  for (const row of rows) {
    const label = row.store ? labels.get(row.store) : undefined;
    const list = byProduct.get(row.description) ?? [];
    if (label && !list.includes(label) && list.length < MAX_STORES) list.push(label);
    byProduct.set(row.description, list);
  }
  return byProduct;
}

/** Busca em cascata no histórico de vendas do ERP: devolve o primeiro passo que achar produtos vendidos em loja ativa. */
export async function searchErpCatalog(steps: SearchStep[]): Promise<CatalogSearch | null> {
  const all = await products();
  for (const step of steps) {
    const found = matchProducts(all, step, MAX_PRODUCTS);
    if (!found.length) continue;
    const stores = await storesFor(found.map((product) => product.description));
    const results = found
      .map((product) => ({ description: product.description, brand: product.brand, category: product.category, sales: product.sales, price: product.price, stores: stores.get(product.description) ?? [] }))
      .filter((product) => product.stores.length);
    if (results.length) return { term: step.label, results };
  }
  return null;
}
