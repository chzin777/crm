import "server-only";
import { isRetailUnit, storeLabel, type StoreInfo } from "@/lib/ai/stock";
import { getStockByProductCodes, storeDirectory } from "@/lib/ai/stock-db";
import { categoryLabel, indexCatalog, type CatalogProduct, type CatalogStoreStock, type IndexedCatalogProduct } from "@/lib/catalog/catalog-query";

/** API do VMSet no host (scripts/vmset-stock-api.py): retrato do catálogo e do saldo por loja. */
const API_URL = (process.env.VMSET_STOCK_URL?.trim() || "http://host.docker.internal:9005").replace(/\/$/, "");
const API_TOKEN = process.env.VMSET_STOCK_TOKEN?.trim() ?? "";
const PRODUCTS_MS = 10 * 60 * 1000;
const STOCK_MS = 60 * 1000;

type ProductRow = [string, string, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, number | null, number | null, number | null, number | null];
type StockRow = [string, string, string, number, number];

async function fetchSnapshot<T>(path: string, refresh: boolean, timeoutMs: number): Promise<{ at: number; items: T[] }> {
  if (!API_TOKEN) throw new Error("Integração de estoque do VMSET não configurada (VMSET_STOCK_TOKEN).");
  const response = await fetch(`${API_URL}${path}${refresh ? "?refresh=1" : ""}`, { headers: { "x-api-key": API_TOKEN }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 503 ? "O VMSET não respondeu agora. Tente novamente em instantes." : `API do VMSET respondeu ${response.status}.`);
  const body = (await response.json()) as { at?: number; items?: T[] };
  if (!Array.isArray(body.items)) throw new Error("Resposta inesperada da API do VMSET.");
  return { at: Number(body.at) || Date.now(), items: body.items };
}

type ProductsState = { loadedAt: number; erpAt: number; products: IndexedCatalogProduct[]; byCode: Map<string, IndexedCatalogProduct> };
type StockState = { loadedAt: number; erpAt: number; byCode: Map<string, CatalogStoreStock[]> };

let products: ProductsState | null = null;
let productsLoading: Promise<ProductsState> | null = null;
let stock: StockState | null = null;
let stockLoading: Promise<StockState> | null = null;

function toProduct(row: ProductRow): CatalogProduct {
  const [code, description, reference, ean, brand, category, subcategory, ncm, color, material, eyeSize, bridge, warrantyMonths, price, priceMin, priceMax] = row;
  return { code, description, reference, ean, brand, category, subcategory, ncm, color, material, eyeSize, bridge, warrantyMonths, price, priceMin, priceMax };
}

/** Nome curto da loja: "LJ 05 · Baixada" (cadastro do CRM) ou o nome do ERP. */
export function unitLabel(code: string, store: StoreInfo | undefined, erpName?: string) {
  const number = code.padStart(2, "0");
  if (store) return `LJ ${number} · ${storeLabel(code, store).split(" — ")[0].replace(/^Loja\s+/, "")}`;
  const place = /\(([^)]+)\)/.exec(erpName ?? "")?.[1];
  return place ? `LJ ${number} · ${place}` : `LJ ${number}`;
}

async function loadProducts(refresh: boolean) {
  const snapshot = await fetchSnapshot<ProductRow>("/catalog/products", refresh, 200_000);
  const list = indexCatalog(snapshot.items.map(toProduct));
  return { loadedAt: Date.now(), erpAt: snapshot.at, products: list, byCode: new Map(list.map((product) => [product.code, product])) };
}

async function loadStock(refresh: boolean) {
  const [snapshot, stores] = await Promise.all([fetchSnapshot<StockRow>("/catalog/stock", refresh, 90_000), storeDirectory()]);
  const byCode = new Map<string, CatalogStoreStock[]>();
  for (const [code, unit, name, available, reserved] of snapshot.items) {
    if (!isRetailUnit(name)) continue;
    const rows = byCode.get(code) ?? [];
    rows.push({ unit, label: unitLabel(unit, stores.get(unit), name), available, reserved });
    byCode.set(code, rows);
  }
  return { loadedAt: Date.now(), erpAt: snapshot.at, byCode };
}

/** Catálogo + saldo em memória (produtos 10 min, saldo 1 min); `refresh` pede um retrato novo ao VMSET. */
export async function getCatalog(refresh = false) {
  const now = Date.now();
  if (refresh || !products || now - products.loadedAt > PRODUCTS_MS) {
    productsLoading ??= loadProducts(refresh).finally(() => { productsLoading = null; });
    // Sem retrato ainda (ou atualização pedida): espera; senão segue com o anterior enquanto renova.
    if (refresh || !products) products = await productsLoading;
    else productsLoading.then((next) => { products = next; }).catch(() => undefined);
  }
  if (refresh || !stock || now - stock.loadedAt > STOCK_MS) {
    stockLoading ??= loadStock(refresh).finally(() => { stockLoading = null; });
    if (refresh || !stock) stock = await stockLoading;
    else stockLoading.then((next) => { stock = next; }).catch(() => undefined);
  }
  const current = { products: products!, stock: stock! };
  return {
    products: current.products.products,
    byCode: current.products.byCode,
    stockOf: (code: string) => current.stock.byCode.get(code) ?? [],
    productsAt: current.products.erpAt,
    stockAt: current.stock.erpAt,
  };
}

/** Filtros da tela: categorias, marcas (da categoria escolhida) e lojas de varejo. */
export async function catalogFacets(catalog: Awaited<ReturnType<typeof getCatalog>>, category?: string) {
  const categories = new Map<string, number>();
  const brands = new Set<string>();
  for (const product of catalog.products) {
    if (product.category) categories.set(product.category, (categories.get(product.category) ?? 0) + 1);
    if (product.brand && (!category || product.category === category)) brands.add(product.brand);
  }
  const directory = await storeDirectory();
  const stores = new Map<string, string>();
  for (const [code, store] of directory) if (isRetailUnit(store.name)) stores.set(code, unitLabel(code, store));
  return {
    categories: [...categories].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, label: categoryLabel(value), count })),
    brands: [...brands].sort((a, b) => a.localeCompare(b, "pt-BR")),
    stores: [...stores].sort((a, b) => Number(a[0]) - Number(b[0])).map(([value, label]) => ({ value, label })),
  };
}

/**
 * Ficha do produto: cadastro do retrato + saldo e preço por loja ao vivo (API do VMSet, 1 código);
 * se a consulta ao vivo falhar, usa o saldo do retrato. Lojas sem saldo entram no fim da tabela.
 */
export async function catalogProductDetail(code: string) {
  const catalog = await getCatalog();
  const product = catalog.byCode.get(code);
  if (!product) return null;
  const [live, directory] = await Promise.all([getStockByProductCodes([code]).catch(() => null), storeDirectory()]);
  const snapshot = catalog.stockOf(code);
  const reservedOf = new Map(snapshot.map((row) => [row.unit, row.reserved]));
  const rows = new Map<string, { unit: string; label: string; available: number; reserved: number; price: number | null }>();
  for (const [unit, store] of directory) if (isRetailUnit(store.name)) rows.set(unit, { unit, label: unitLabel(unit, store), available: 0, reserved: 0, price: null });
  const liveOk = live?.stockStatus === "ok";
  if (liveOk) {
    for (const unit of live.byCode[code] ?? []) {
      if (!isRetailUnit(unit.name)) continue;
      rows.set(unit.unit, { unit: unit.unit, label: unitLabel(unit.unit, directory.get(unit.unit), unit.name), available: unit.qty, reserved: reservedOf.get(unit.unit) ?? 0, price: unit.price ?? null });
    }
  } else {
    for (const row of snapshot) rows.set(row.unit, { ...row, price: null });
  }
  const stores = [...rows.values()].sort((a, b) => Number(b.available > 0) - Number(a.available > 0) || b.available - a.available || Number(a.unit) - Number(b.unit));
  const prices = [...new Set(stores.map((row) => row.price).filter((price): price is number => price !== null))].sort((a, b) => a - b);
  const { hay: _hay, compactHay: _compact, ...plain } = product;
  return {
    product: { ...plain, categoryLabel: categoryLabel(product.category) },
    stores,
    prices,
    live: liveOk,
    totalStock: stores.reduce((sum, row) => sum + Math.max(0, row.available), 0),
    stockAt: liveOk ? Date.now() : catalog.stockAt,
  };
}
