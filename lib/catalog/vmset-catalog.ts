import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { firstDispatch } from "@/lib/chat/conversation";
import { isRetailUnit, storeLabel, type StoreInfo } from "@/lib/ai/stock";
import { getStockByProductCodes, storeDirectory } from "@/lib/ai/stock-db";
import { categoryLabel, indexCatalog, type CatalogProduct, type CatalogStoreStock, type IndexedCatalogProduct } from "@/lib/catalog/catalog-query";
import { diffProducts, diffStock } from "@/lib/catalog/catalog-sync";

/** API do VMSet no host (scripts/vmset-stock-api.py): retrato do catálogo e do saldo por loja. */
const API_URL = (process.env.VMSET_STOCK_URL?.trim() || "http://host.docker.internal:9005").replace(/\/$/, "");
const API_TOKEN = process.env.VMSET_STOCK_TOKEN?.trim() ?? "";

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

/** Índice em memória montado a partir do banco local (nunca direto do ERP na requisição da tela). */
type CatalogState = {
  version: string;
  checkedAt: number;
  products: IndexedCatalogProduct[];
  byCode: Map<string, IndexedCatalogProduct>;
  stock: Map<string, CatalogStoreStock[]>;
  productsAt: number;
  stockAt: number;
};

let state: CatalogState | null = null;
let stateLoading: Promise<CatalogState> | null = null;
let syncRunning: Promise<CatalogSyncResult> | null = null;

const SYNC_KEY = "catalog-sync";
/** Produtos (cadastro/preço) a cada 15 min; saldo por loja a cada 5 min. Tudo em segundo plano. */
export const PRODUCTS_SYNC_MS = 15 * 60 * 1000;
export const STOCK_SYNC_MS = 5 * 60 * 1000;
/** De quanto em quanto tempo a réplica confere se o banco tem versão nova do catálogo. */
const VERSION_CHECK_MS = 30 * 1000;
const CHUNK = 2000;

export type CatalogSyncState = { productsAt: number | null; stockAt: number | null; productsSyncedAt: number | null; stockSyncedAt: number | null; version: string; running: boolean; last?: { created: number; updated: number; deactivated: number; stockChanged: number; at: number } };
export type CatalogSyncResult = { products: ProductDiffSummary | null; stockChanged: number | null };
type ProductDiffSummary = { created: number; updated: number; deactivated: number };

async function readSyncState(): Promise<CatalogSyncState> {
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: SYNC_KEY } });
  const value = (row?.value ?? {}) as Partial<CatalogSyncState>;
  return { productsAt: value.productsAt ?? null, stockAt: value.stockAt ?? null, productsSyncedAt: value.productsSyncedAt ?? null, stockSyncedAt: value.stockSyncedAt ?? null, version: value.version ?? "", running: false, last: value.last };
}

async function writeSyncState(patch: Partial<CatalogSyncState>) {
  const current = await readSyncState();
  const next = { ...current, ...patch, running: undefined };
  await prisma.crmWorkspaceData.upsert({ where: { key: SYNC_KEY }, create: { key: SYNC_KEY, value: next as unknown as Prisma.InputJsonValue }, update: { value: next as unknown as Prisma.InputJsonValue } });
}

/** Situação da sincronização para o indicador da tela ("Última sincronização há X min" / "Sincronizando..."). */
export async function catalogSyncStatus(): Promise<CatalogSyncState> {
  return { ...(await readSyncState()), running: !!syncRunning };
}

type DbProductRow = CatalogProduct & { imageUrl: string | null };

/** Catálogo ativo + saldo do banco local → índice de busca em memória. */
async function loadFromDb(): Promise<CatalogState | null> {
  const sync = await readSyncState();
  const [rows, stockRows, stores] = await Promise.all([
    prisma.$queryRaw<DbProductRow[]>`SELECT code, description, reference, ean, brand, category, subcategory, ncm, color, material, "eyeSize", bridge, "warrantyMonths", price, "priceMin", "priceMax", "imageUrl" FROM "CatalogProduct" WHERE active`,
    prisma.$queryRaw<{ code: string; unit: string; erpName: string; available: number; reserved: number }[]>`SELECT code, unit, "erpName", available, reserved FROM "CatalogStock"`,
    storeDirectory(),
  ]);
  if (!rows.length) return null;
  const list = indexCatalog(rows.map(({ imageUrl: _image, ...product }) => product));
  const stock = new Map<string, CatalogStoreStock[]>();
  for (const row of stockRows) {
    if (!isRetailUnit(row.erpName)) continue;
    const entries = stock.get(row.code) ?? [];
    entries.push({ unit: row.unit, label: unitLabel(row.unit, stores.get(row.unit), row.erpName), available: row.available, reserved: row.reserved });
    stock.set(row.code, entries);
  }
  return { version: sync.version, checkedAt: Date.now(), products: list, byCode: new Map(list.map((product) => [product.code, product])), stock, productsAt: sync.productsAt ?? Date.now(), stockAt: sync.stockAt ?? sync.productsAt ?? Date.now() };
}

async function writeProducts(diff: ReturnType<typeof diffProducts>, now: Date) {
  for (let start = 0; start < diff.upserts.length; start += CHUNK) {
    const part = diff.upserts.slice(start, start + CHUNK);
    const col = <K extends keyof (typeof part)[number]>(key: K) => part.map((item) => item[key] ?? null);
    await prisma.$executeRaw`
      INSERT INTO "CatalogProduct" (code, description, reference, ean, brand, category, subcategory, ncm, color, material, "eyeSize", bridge, "warrantyMonths", price, "priceMin", "priceMax", hash, active, "updatedAt", "lastSyncedAt")
      SELECT u.*, true, ${now}, ${now} FROM unnest(
        ${col("code")}::text[], ${col("description")}::text[], ${col("reference")}::text[], ${col("ean")}::text[], ${col("brand")}::text[], ${col("category")}::text[],
        ${col("subcategory")}::text[], ${col("ncm")}::text[], ${col("color")}::text[], ${col("material")}::text[], ${col("eyeSize")}::text[], ${col("bridge")}::text[],
        ${col("warrantyMonths")}::int[], ${col("price")}::float8[], ${col("priceMin")}::float8[], ${col("priceMax")}::float8[], ${col("hash")}::text[]
      ) AS u(code, description, reference, ean, brand, category, subcategory, ncm, color, material, "eyeSize", bridge, "warrantyMonths", price, "priceMin", "priceMax", hash)
      ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, reference = EXCLUDED.reference, ean = EXCLUDED.ean, brand = EXCLUDED.brand,
        category = EXCLUDED.category, subcategory = EXCLUDED.subcategory, ncm = EXCLUDED.ncm, color = EXCLUDED.color, material = EXCLUDED.material,
        "eyeSize" = EXCLUDED."eyeSize", bridge = EXCLUDED.bridge, "warrantyMonths" = EXCLUDED."warrantyMonths", price = EXCLUDED.price,
        "priceMin" = EXCLUDED."priceMin", "priceMax" = EXCLUDED."priceMax", hash = EXCLUDED.hash, active = true, "updatedAt" = EXCLUDED."updatedAt", "lastSyncedAt" = EXCLUDED."lastSyncedAt"`;
  }
  for (let start = 0; start < diff.deactivate.length; start += CHUNK) {
    await prisma.$executeRaw`UPDATE "CatalogProduct" SET active = false, "updatedAt" = ${now} WHERE code = ANY(${diff.deactivate.slice(start, start + CHUNK)}::text[])`;
  }
}

async function writeStock(diff: ReturnType<typeof diffStock>, now: Date) {
  for (let start = 0; start < diff.upserts.length; start += CHUNK) {
    const part = diff.upserts.slice(start, start + CHUNK);
    await prisma.$executeRaw`
      INSERT INTO "CatalogStock" (code, unit, "erpName", available, reserved, "syncedAt")
      SELECT u.*, ${now} FROM unnest(${part.map((row) => row.code)}::text[], ${part.map((row) => row.unit)}::text[], ${part.map((row) => row.erpName)}::text[], ${part.map((row) => row.available)}::float8[], ${part.map((row) => row.reserved)}::float8[])
        AS u(code, unit, "erpName", available, reserved)
      ON CONFLICT (code, unit) DO UPDATE SET "erpName" = EXCLUDED."erpName", available = EXCLUDED.available, reserved = EXCLUDED.reserved, "syncedAt" = EXCLUDED."syncedAt"`;
  }
  for (let start = 0; start < diff.removals.length; start += CHUNK) {
    const part = diff.removals.slice(start, start + CHUNK);
    await prisma.$executeRaw`DELETE FROM "CatalogStock" s USING unnest(${part.map((row) => row.code)}::text[], ${part.map((row) => row.unit)}::text[]) AS r(code, unit) WHERE s.code = r.code AND s.unit = r.unit`;
  }
}

/**
 * Sincronização incremental com o VMSET (sempre fora da requisição da tela): retrato do ERP → diferença por hash →
 * grava só novos/alterados, desativa os que sumiram e atualiza o saldo alterado. Uma por vez por réplica e,
 * entre réplicas (blue/green), uma por janela de 2 min.
 */
export function syncCatalog(options: { products: boolean; stock: boolean; refresh?: boolean }): Promise<CatalogSyncResult> {
  if (syncRunning) return syncRunning;
  syncRunning = (async () => {
    const now = new Date();
    const scope = `${options.products ? "p" : ""}${options.stock ? "s" : ""}`;
    if (!(await firstDispatch(`catalog-sync:${scope}:${Math.floor(now.getTime() / 120_000)}`))) return { products: null, stockChanged: null };
    let products: ProductDiffSummary | null = null;
    let stockChanged: number | null = null;
    const patch: Partial<CatalogSyncState> = {};
    if (options.products) {
      const snapshot = await fetchSnapshot<ProductRow>("/catalog/products", !!options.refresh, 200_000);
      const stored = new Map((await prisma.$queryRaw<{ code: string; hash: string; active: boolean }[]>`SELECT code, hash, active FROM "CatalogProduct"`).map((row) => [row.code, { hash: row.hash, active: row.active }]));
      const diff = diffProducts(stored, snapshot.items.map(toProduct));
      await writeProducts(diff, now);
      products = { created: diff.created, updated: diff.updated, deactivated: diff.deactivate.length };
      Object.assign(patch, { productsAt: snapshot.at, productsSyncedAt: now.getTime() });
    }
    if (options.stock) {
      const snapshot = await fetchSnapshot<StockRow>("/catalog/stock", !!options.refresh, 90_000);
      const stored = new Map((await prisma.$queryRaw<{ code: string; unit: string; erpName: string; available: number; reserved: number }[]>`SELECT code, unit, "erpName", available, reserved FROM "CatalogStock"`).map((row) => [`${row.code}|${row.unit}`, row]));
      const diff = diffStock(stored, snapshot.items.map(([code, unit, erpName, available, reserved]) => ({ code, unit, erpName, available: Number(available) || 0, reserved: Number(reserved) || 0 })));
      await writeStock(diff, now);
      stockChanged = diff.upserts.length + diff.removals.length;
      Object.assign(patch, { stockAt: snapshot.at, stockSyncedAt: now.getTime() });
    }
    const changed = (products ? products.created + products.updated + products.deactivated : 0) + (stockChanged ?? 0);
    const previous = await readSyncState();
    await writeSyncState({ ...patch, version: changed || !previous.version ? `${now.getTime()}` : previous.version, last: { created: products?.created ?? 0, updated: products?.updated ?? 0, deactivated: products?.deactivated ?? 0, stockChanged: stockChanged ?? 0, at: now.getTime() } });
    if (changed) {
      console.log(`[catalogo] sincronizado: ${products?.created ?? 0} novos, ${products?.updated ?? 0} alterados, ${products?.deactivated ?? 0} inativos, ${stockChanged ?? 0} saldos`);
      // Esta réplica já passa a servir a versão nova (a outra cor percebe pela versão em até 30 s).
      if (state) await loadFromDb().then((loaded) => { if (loaded) state = loaded; }).catch(() => undefined);
    }
    return { products, stockChanged };
  })().finally(() => { syncRunning = null; });
  return syncRunning;
}

/** Relógio por minuto: produtos a cada 15 min e saldo a cada 5 min (em segundo plano, sem esperar). */
export async function scheduleCatalogSync(now = Date.now()) {
  const sync = await readSyncState();
  const products = !sync.productsSyncedAt || now - sync.productsSyncedAt >= PRODUCTS_SYNC_MS;
  const stock = !sync.stockSyncedAt || now - sync.stockSyncedAt >= STOCK_SYNC_MS;
  if (!products && !stock) return false;
  void syncCatalog({ products, stock }).catch((error: unknown) => console.warn(`[catalogo] sincronização falhou: ${error instanceof Error ? error.message : error}`));
  return true;
}

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

function reloadState() {
  stateLoading ??= loadFromDb()
    .then(async (loaded) => {
      if (loaded) return loaded;
      // Banco ainda vazio (primeira instalação): uma única carga completa do VMSET, depois sempre do banco.
      await syncCatalog({ products: true, stock: true });
      const filled = await loadFromDb();
      if (!filled) throw new Error("Catálogo do VMSET ainda não sincronizado. Tente novamente em instantes.");
      return filled;
    })
    .then((loaded) => (state = loaded))
    .finally(() => { stateLoading = null; });
  return stateLoading;
}

/**
 * Catálogo para a tela: sempre do banco local (índice em memória). Com versão nova no banco (sincronização feita),
 * recarrega em segundo plano e segue servindo a anterior. Nunca espera o VMSET (salvo o banco ainda vazio).
 */
export async function getCatalog() {
  if (!state) await reloadState();
  else if (Date.now() - state.checkedAt > VERSION_CHECK_MS) {
    state.checkedAt = Date.now();
    void readSyncState().then((sync) => { if (sync.version && sync.version !== state?.version) void reloadState().catch(() => undefined); }).catch(() => undefined);
  }
  const current = state!;
  return {
    products: current.products,
    byCode: current.byCode,
    stockOf: (code: string) => current.stock.get(code) ?? [],
    productsAt: current.productsAt,
    stockAt: current.stockAt,
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
