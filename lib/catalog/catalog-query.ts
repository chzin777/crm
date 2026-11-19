/**
 * Catálogo de produtos do VMSET (página /produtos): índice de busca, filtros, ordenação e paginação em memória.
 * Funções puras; o carregamento do ERP fica em lib/catalog/vmset-catalog.ts.
 */

export type CatalogProduct = {
  code: string;
  description: string;
  reference: string | null;
  ean: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  ncm: string | null;
  color: string | null;
  material: string | null;
  /** Medidas da armação (aro e ponte), quando cadastradas. */
  eyeSize: string | null;
  bridge: string | null;
  warrantyMonths: number | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
};

/** Saldo de uma loja de varejo (já sem CD, ADM e fábrica). */
export type CatalogStoreStock = { unit: string; label: string; available: number; reserved: number };

export type StockStatus = "em_estoque" | "ultimas_unidades" | "sem_estoque";

export type CatalogSort = "relevancia" | "menor_preco" | "maior_preco" | "maior_estoque" | "alfabetica";
export const CATALOG_SORTS: { key: CatalogSort; label: string }[] = [
  { key: "relevancia", label: "Mais relevantes" },
  { key: "menor_preco", label: "Menor preço" },
  { key: "maior_preco", label: "Maior preço" },
  { key: "maior_estoque", label: "Maior estoque" },
  { key: "alfabetica", label: "Ordem alfabética" },
];
export const CATALOG_PAGE_SIZES = [12, 24, 48] as const;

/** Nome da categoria do ERP para a tela. */
const CATEGORY_LABELS: Record<string, string> = {
  ARMACAO: "Armações",
  "OCULOS SOLAR": "Óculos de sol",
  LENTES: "Lentes",
  "LENTE PRONTA": "Lentes prontas",
  ACESSORIOS: "Acessórios",
  "LENTES DE CONTATO": "Lentes de contato",
  RELOGIO: "Relógios",
};
export const categoryLabel = (category: string | null) => (category ? CATEGORY_LABELS[category] ?? category : "Sem categoria");

/** Até 2 peças é "últimas unidades". */
export function stockStatus(available: number): StockStatus {
  if (available <= 0) return "sem_estoque";
  return available <= 2 ? "ultimas_unidades" : "em_estoque";
}

export const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const compact = (value: string) => fold(value).replace(/[^A-Z0-9]/g, "");

export type IndexedCatalogProduct = CatalogProduct & { hay: string; compactHay: string };

export function indexCatalog(products: CatalogProduct[]): IndexedCatalogProduct[] {
  return products.map((product) => {
    const parts = [product.code, product.reference, product.ean, product.description, product.brand, product.subcategory, product.color].filter(Boolean).join(" ");
    return { ...product, hay: fold(parts), compactHay: compact(parts) };
  });
}

export type CatalogQuery = {
  q?: string;
  category?: string;
  brand?: string;
  store?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: CatalogSort;
  page?: number;
  pageSize?: number;
};

export type CatalogListItem = {
  code: string;
  reference: string | null;
  description: string;
  brand: string | null;
  category: string;
  subcategory: string | null;
  ean: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  totalStock: number;
  /** Saldo na loja filtrada (null sem filtro de loja). */
  storeStock: number | null;
  status: StockStatus;
  storesWithStock: number;
  topStores: { label: string; available: number }[];
};

function relevance(product: IndexedCatalogProduct, tokens: string[], rawCompact: string) {
  let score = 0;
  if (rawCompact && (product.code === rawCompact || compact(product.ean ?? "") === rawCompact)) score += 1000;
  if (rawCompact && compact(product.reference ?? "").startsWith(rawCompact)) score += 300;
  if (rawCompact && product.compactHay.includes(rawCompact)) score += 100;
  const description = fold(product.description);
  for (const token of tokens) if (description.startsWith(token) || description.includes(` ${token}`)) score += 10;
  if (tokens.some((token) => fold(product.brand ?? "") === token)) score += 20;
  return score;
}

/** Busca + filtros + ordenação + página. `stockOf` traz o saldo por loja de varejo de um código. */
export function queryCatalog(products: IndexedCatalogProduct[], stockOf: (code: string) => CatalogStoreStock[], query: CatalogQuery) {
  const pageSize = CATALOG_PAGE_SIZES.includes(query.pageSize as 12) ? (query.pageSize as number) : 24;
  const tokens = fold(query.q ?? "").split(/[^A-Z0-9/.-]+/).map((token) => token.replace(/^[./-]+|[./-]+$/g, "")).filter(Boolean);
  const rawCompact = compact(query.q ?? "");
  const store = query.store?.trim() || "";
  const rows: { product: IndexedCatalogProduct; stock: CatalogStoreStock[]; total: number; measured: number; score: number }[] = [];
  for (const product of products) {
    if (query.category && product.category !== query.category) continue;
    if (query.brand && product.brand !== query.brand) continue;
    if (query.minPrice !== undefined && !(product.price !== null && product.price >= query.minPrice)) continue;
    if (query.maxPrice !== undefined && !(product.price !== null && product.price <= query.maxPrice)) continue;
    if (tokens.length && !tokens.every((token) => product.hay.includes(token) || product.compactHay.includes(compact(token)))) continue;
    const stock = stockOf(product.code);
    const total = stock.reduce((sum, row) => sum + Math.max(0, row.available), 0);
    const measured = store ? Math.max(0, stock.find((row) => row.unit === store)?.available ?? 0) : total;
    if (query.inStock && measured <= 0) continue;
    rows.push({ product, stock, total, measured, score: tokens.length ? relevance(product, tokens, rawCompact) : 0 });
  }

  const byName = (a: (typeof rows)[number], b: (typeof rows)[number]) => a.product.description.localeCompare(b.product.description, "pt-BR");
  const priceOf = (row: (typeof rows)[number], empty: number) => row.product.price ?? empty;
  const sort = query.sort ?? "relevancia";
  rows.sort((a, b) => {
    if (sort === "menor_preco") return priceOf(a, Infinity) - priceOf(b, Infinity) || byName(a, b);
    if (sort === "maior_preco") return priceOf(b, -Infinity) - priceOf(a, -Infinity) || byName(a, b);
    if (sort === "maior_estoque") return b.measured - a.measured || byName(a, b);
    if (sort === "alfabetica") return byName(a, b);
    // Relevância: aderência à busca, depois quem tem peça para vender agora.
    return b.score - a.score || Number(b.measured > 0) - Number(a.measured > 0) || b.measured - a.measured || byName(a, b);
  });

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.floor(query.page ?? 1)), pages);
  const items: CatalogListItem[] = rows.slice((page - 1) * pageSize, page * pageSize).map(({ product, stock, total: totalStock, measured }) => {
    const withStock = stock.filter((row) => row.available > 0).sort((a, b) => b.available - a.available);
    return {
      code: product.code,
      reference: product.reference,
      description: product.description,
      brand: product.brand,
      category: categoryLabel(product.category),
      subcategory: product.subcategory,
      ean: product.ean,
      price: product.price,
      priceMin: product.priceMin,
      priceMax: product.priceMax,
      totalStock,
      storeStock: store ? measured : null,
      status: stockStatus(measured),
      storesWithStock: withStock.length,
      topStores: withStock.slice(0, 3).map((row) => ({ label: row.label, available: row.available })),
    };
  });
  return { items, total, page, pageSize, pages };
}

/** Texto pronto para colar no WhatsApp do cliente. */
export function whatsappSummary(product: { description: string; brand: string | null; reference: string | null; code: string; price: number | null }, stores: { label: string; available: number }[]) {
  const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const available = stores.filter((store) => store.available > 0);
  const lines = [
    `*${product.description}*`,
    product.brand ? `Marca: ${product.brand}` : null,
    `Ref.: ${product.reference || product.code} (cód. ${product.code})`,
    product.price ? `Valor: *${brl(product.price)}*` : "Valor: sob consulta",
    available.length
      ? `Disponível em: ${available.slice(0, 5).map((store) => store.label).join(", ")}${available.length > 5 ? ` e mais ${available.length - 5} loja${available.length - 5 === 1 ? "" : "s"}` : ""}`
      : "No momento sem estoque nas lojas — posso verificar a reposição para você.",
  ];
  return lines.filter(Boolean).join("\n");
}
