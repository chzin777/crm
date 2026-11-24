"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, CloudCheck, Copy, LayoutGrid, List, Loader2, PackageSearch, RefreshCw, Search, Store, X } from "lucide-react";
import { FormSelect } from "@/components/FormSelect";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useToast } from "@/components/ToastProvider";
import { ProductDetailDialog } from "@/components/produtos/ProductDetailDialog";
import { StockBadge, brl, copyText } from "@/components/produtos/catalog-ui";
import { CATALOG_PAGE_SIZES, CATALOG_SORTS, syncAgeLabel, type CatalogListItem, type CatalogSort } from "@/lib/catalog/catalog-query";

type SyncStatus = { productsSyncedAt: number | null; stockSyncedAt: number | null; running: boolean; last?: { created: number; updated: number; deactivated: number; stockChanged: number; at: number } };

type Facets = { categories: { value: string; label: string; count: number }[]; brands: string[]; stores: { value: string; label: string }[] };
type Result = { items: CatalogListItem[]; total: number; page: number; pageSize: number; pages: number; facets: Facets; productsAt: number; stockAt: number };

const ALL_CATEGORIES = "Todas as categorias";
const ALL_BRANDS = "Todas as marcas";
const ALL_STORES = "Todas as lojas";
const VIEW_KEY = "produtos:visualizacao";
const INPUT = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] focus:ring-2 focus:ring-[#002187]/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600] dark:focus:ring-[#C4D600]/15";

function readView(): "grade" | "lista" {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "lista" ? "lista" : "grade";
  } catch {
    return "grade";
  }
}

/** Páginas exibidas: primeira, última e vizinhas da atual, com reticências. */
function pageList(page: number, pages: number): (number | "...")[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter((value) => value >= 1 && value <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const result: (number | "...")[] = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) result.push("...");
    result.push(value);
  });
  return result;
}

export default function ProdutosPage() {
  const toast = useToast();
  const [view, setView] = useState<"grade" | "lista">("grade");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [store, setStore] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [inStock, setInStock] = useState(true);
  const [sort, setSort] = useState<CatalogSort>("relevancia");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(24);
  const [reloadKey, setReloadKey] = useState(0);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [state, setState] = useState<{ signature: string; result?: Result; error?: string } | null>(null);
  const [lastResult, setLastResult] = useState<Result | null>(null);
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setView(readView()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const params = useMemo(() => {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ordem: sort });
    if (debounced) query.set("q", debounced);
    if (category) query.set("categoria", category);
    if (brand) query.set("marca", brand);
    if (store) query.set("loja", store);
    if (minPrice.trim()) query.set("min", minPrice.trim());
    if (maxPrice.trim()) query.set("max", maxPrice.trim());
    if (inStock) query.set("estoque", "1");
    return query.toString();
  }, [page, pageSize, sort, debounced, category, brand, store, minPrice, maxPrice, inStock]);
  const signature = `${params}#${reloadKey}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/produtos?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as Result & { error?: string };
        if (!response.ok) {
          setState({ signature, error: body.error || "Não foi possível carregar o catálogo." });
          return;
        }
        setState({ signature, result: body });
        setLastResult(body);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ signature, error: error instanceof Error ? error.message : "Falha de conexão." });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a assinatura cobre filtros e recarga
  }, [signature]);

  // Situação da sincronização em segundo plano: confere a cada minuto (a cada 5 s enquanto sincroniza) e, ao terminar,
  // recarrega a página atual da listagem sem bloquear a tela.
  const running = !!sync?.running;
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/produtos/sync", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<SyncStatus>) : null))
      .then((next) => {
        if (!alive || !next) return;
        setClock(Date.now());
        setSync((previous) => {
          if (previous?.running && !next.running) {
            setReloadKey((key) => key + 1);
            const last = next.last;
            if (last && (last.created || last.updated)) toast.success("Catálogo sincronizado", `${last.created} novo${last.created === 1 ? "" : "s"} e ${last.updated} alterado${last.updated === 1 ? "" : "s"}.`);
          }
          return next;
        });
      })
      .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, running ? 5000 : 60000);
    return () => { alive = false; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- o intervalo muda só com "sincronizando"
  }, [running]);

  const current = state?.signature === signature ? state : null;
  const loading = !current;
  const data = current?.result ?? lastResult;
  const facets = data?.facets;
  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setPage(1); };
  const storeLabel = facets?.stores.find((item) => item.value === store)?.label;
  const hasFilters = !!(search || category || brand || store || minPrice || maxPrice || !inStock);

  const changeView = (next: "grade" | "lista") => {
    setView(next);
    try { window.localStorage.setItem(VIEW_KEY, next); } catch { /* preferência só deste navegador */ }
  };
  const copyCode = async (item: CatalogListItem) => {
    const value = item.reference || item.code;
    if (await copyText(value)) {
      setCopied(item.code);
      window.setTimeout(() => setCopied((code) => (code === item.code ? null : code)), 1500);
      toast.success("Copiado", value);
    } else toast.error("Não foi possível copiar", value);
  };
  const clearFilters = () => {
    setSearch(""); setDebounced(""); setCategory(""); setBrand(""); setStore(""); setMinPrice(""); setMaxPrice(""); setInStock(true); setSort("relevancia"); setPage(1);
  };
  const syncNow = () => {
    setSync((previous) => (previous ? { ...previous, running: true } : previous));
    fetch("/api/produtos/sync", { method: "POST", cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (SyncStatus & { error?: string }) | null;
        if (!response.ok || !body) throw new Error(body?.error || "Não foi possível iniciar a sincronização.");
        setSync(body);
      })
      .catch((error: unknown) => {
        setSync((previous) => (previous ? { ...previous, running: false } : previous));
        toast.error("Sincronização não iniciada", error instanceof Error ? error.message : "Falha de conexão.");
      });
  };
  const syncedAt = sync ? Math.max(sync.productsSyncedAt ?? 0, sync.stockSyncedAt ?? 0) || null : null;

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : (data!.page - 1) * data!.pageSize + 1;
  const to = data ? Math.min(total, data.page * data.pageSize) : 0;

  const codeButton = (item: CatalogListItem) => (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); void copyCode(item); }}
      title="Copiar referência"
      aria-label={`Copiar referência ${item.reference || item.code}`}
      className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-600 transition hover:bg-[#002187]/10 hover:text-[#002187] dark:bg-white/10 dark:text-slate-300 dark:hover:bg-[#C4D600]/15 dark:hover:text-[#C4D600]"
    >
      <span className="truncate">{item.reference || item.code}</span>
      {copied === item.code ? <Check className="h-3 w-3 shrink-0" /> : <Copy className="h-3 w-3 shrink-0" />}
    </button>
  );
  const stockLine = (item: CatalogListItem) => store
    ? `${(item.storeStock ?? 0).toLocaleString("pt-BR")} em ${storeLabel ?? "esta loja"} · ${item.totalStock.toLocaleString("pt-BR")} na rede`
    : item.storesWithStock
      ? `${item.totalStock.toLocaleString("pt-BR")} peça${item.totalStock === 1 ? "" : "s"} em ${item.storesWithStock} loja${item.storesWithStock === 1 ? "" : "s"}`
      : "Sem saldo nas lojas";
  const priceText = (item: CatalogListItem) => (item.price ? brl(item.price) : "Sob consulta");

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-[#051647] dark:text-white">Catálogo de Produtos</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {data ? `${total.toLocaleString("pt-BR")} produto${total === 1 ? "" : "s"} encontrado${total === 1 ? "" : "s"}` : "Produtos, preços e estoque do VMSET"}
            {data && <span className="text-slate-400"> · saldo das {new Date(data.stockAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
          </p>
          {sync && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500" aria-live="polite">
              {running ? <><Loader2 className="h-3 w-3 animate-spin" /> Sincronizando novos itens do VMSET...</> : <><CloudCheck className="h-3 w-3" /> {syncAgeLabel(syncedAt, clock)}</>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="Visualização" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
            {([["grade", LayoutGrid, "Grade"], ["lista", List, "Lista"]] as const).map(([value, Icon, label]) => (
              <button key={value} type="button" role="radio" aria-checked={view === value} aria-label={label} title={label} onClick={() => changeView(value)} className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition ${view === value ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}>
                <Icon className="h-4 w-4" /><span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={syncNow} disabled={running} title="Busca no VMSET só o que é novo ou mudou, sem travar a listagem" className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
            <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">Sincronizar agora</span>
          </button>
        </div>
      </header>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
          <label className="block space-y-1.5">
            <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Buscar</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Código, referência, descrição, marca ou EAN" aria-label="Buscar produtos" className={`${INPUT} pl-9`} />
            </span>
          </label>
          <SearchableSelect label="Loja / filial" value={storeLabel ?? ALL_STORES} options={[ALL_STORES, ...(facets?.stores.map((item) => item.label) ?? [])]} onChange={(label) => resetPage(setStore)(facets?.stores.find((item) => item.label === label)?.value ?? "")} isLoading={!facets} />
          <FormSelect label="Categoria" value={facets?.categories.find((item) => item.value === category)?.label ?? ALL_CATEGORIES} options={[ALL_CATEGORIES, ...(facets?.categories.map((item) => item.label) ?? [])]} onChange={(label) => { setCategory(facets?.categories.find((item) => item.label === label)?.value ?? ""); setBrand(""); setPage(1); }} />
          <SearchableSelect label="Marca" value={brand || ALL_BRANDS} options={[ALL_BRANDS, ...(facets?.brands ?? [])]} onChange={(value) => resetPage(setBrand)(value === ALL_BRANDS ? "" : value)} isLoading={!facets} />
          <FormSelect label="Ordenar por" value={CATALOG_SORTS.find((item) => item.key === sort)?.label ?? CATALOG_SORTS[0].label} options={CATALOG_SORTS.map((item) => item.label)} onChange={(label) => resetPage(setSort)(CATALOG_SORTS.find((item) => item.label === label)?.key ?? "relevancia")} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-end gap-2">
            <label className="block w-28 space-y-1.5"><span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Preço mín.</span><input inputMode="decimal" value={minPrice} onChange={(event) => { setMinPrice(event.target.value.replace(/[^\d,.]/g, "")); setPage(1); }} placeholder="R$ 0" className={INPUT} /></label>
            <label className="block w-28 space-y-1.5"><span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Preço máx.</span><input inputMode="decimal" value={maxPrice} onChange={(event) => { setMaxPrice(event.target.value.replace(/[^\d,.]/g, "")); setPage(1); }} placeholder="Sem limite" className={INPUT} /></label>
          </div>
          <button type="button" role="switch" aria-checked={inStock} onClick={() => { setInStock((value) => !value); setPage(1); }} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5">
            <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition ${inStock ? "bg-[#002187] dark:bg-[#C4D600]" : "bg-slate-300 dark:bg-slate-600"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${inStock ? "left-[18px]" : "left-0.5"}`} /></span>
            Somente em estoque
          </button>
          {hasFilters && <button type="button" onClick={clearFilters} className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"><X className="h-4 w-4" /> Limpar filtros</button>}
          {store && <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#C4D600]/20 px-3 py-1 text-xs font-semibold text-[#051647] dark:text-[#C4D600]"><Store className="h-3.5 w-3.5" /> Estoque em destaque: {storeLabel}</span>}
        </div>
      </section>

      {current?.error && (
        <p role="alert" className="rounded-xl border border-[#F7915E]/40 bg-[#F7915E]/10 px-4 py-3 text-sm text-[#9a3d12] dark:text-[#F7915E]">{current.error}</p>
      )}
      {loading && !data && (
        <p className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07194f] dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando o catálogo...
        </p>
      )}

      {data && (
        <div className={`relative transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          {data.items.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center dark:border-slate-800 dark:bg-[#07194f]">
              <PackageSearch className="mx-auto h-6 w-6 text-slate-400" />
              <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Nenhum produto encontrado</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{inStock ? "Desligue \"Somente em estoque\" ou mude a busca." : "Tente outra busca ou filtro."}</p>
            </div>
          ) : view === "grade" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {data.items.map((item) => (
                <article key={item.code} role="button" tabIndex={0} onClick={() => setOpenCode(item.code)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpenCode(item.code); } }} className="group flex min-w-0 cursor-pointer flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:-translate-y-0.5 hover:border-[#002187]/30 hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#002187] dark:border-slate-800 dark:bg-[#07194f] dark:hover:border-[#C4D600]/40 dark:focus-visible:outline-[#C4D600]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-[11px] font-semibold uppercase tracking-wide text-[#002187] dark:text-[#C4D600]">{item.brand ?? "Sem marca"}</span>
                    <StockBadge status={item.status} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 text-sm font-semibold text-slate-900 group-hover:text-[#002187] dark:text-white dark:group-hover:text-[#C4D600]">{item.description}</h2>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{item.category}{item.subcategory ? ` · ${item.subcategory}` : ""}</p>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">{codeButton(item)}<span className="text-[10px] text-slate-400">cód. {item.code}</span></div>
                  <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <div className="min-w-0">
                      <p className="text-lg font-bold tabular-nums text-[#051647] dark:text-white">{priceText(item)}</p>
                      {item.priceMin && item.priceMax && item.priceMin !== item.priceMax && <p className="text-[10px] text-slate-400">{brl(item.priceMin)} a {brl(item.priceMax)} conforme a loja</p>}
                    </div>
                  </div>
                  <div className="min-w-0 text-[11px] text-slate-500 dark:text-slate-400">
                    <p className="font-medium text-slate-700 dark:text-slate-300">{stockLine(item)}</p>
                    {item.topStores.length > 0 && <p className="mt-0.5 truncate" title={item.topStores.map((row) => `${row.label}: ${row.available}`).join(", ")}>{item.topStores.map((row) => `${row.label} (${row.available.toLocaleString("pt-BR")})`).join(" · ")}{item.storesWithStock > item.topStores.length ? ` +${item.storesWithStock - item.topStores.length}` : ""}</p>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50/80 text-[10px] font-bold uppercase text-slate-400 dark:bg-slate-800/40">
                  <tr><th className="px-4 py-3">Referência</th><th className="px-3 py-3">Produto</th><th className="px-3 py-3">Marca</th><th className="px-3 py-3 text-right">Preço</th><th className="px-3 py-3 text-right">{store ? "Na loja" : "Estoque"}</th><th className="px-3 py-3">Lojas com a peça</th><th className="px-4 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.items.map((item) => (
                    <tr key={item.code} tabIndex={0} onClick={() => setOpenCode(item.code)} onKeyDown={(event) => { if (event.key === "Enter") setOpenCode(item.code); }} className="cursor-pointer transition-colors hover:bg-slate-50/80 focus-visible:outline-2 focus-visible:outline-[#002187] dark:hover:bg-slate-800/30">
                      <td className="max-w-44 px-4 py-2.5">{codeButton(item)}<span className="mt-0.5 block text-[10px] text-slate-400">cód. {item.code}</span></td>
                      <td className="max-w-80 px-3 py-2.5"><span className="block truncate font-medium text-slate-900 dark:text-white" title={item.description}>{item.description}</span><span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{item.category}{item.subcategory ? ` · ${item.subcategory}` : ""}</span></td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">{item.brand ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-[#051647] dark:text-white">{priceText(item)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{(store ? item.storeStock ?? 0 : item.totalStock).toLocaleString("pt-BR")}{store && <span className="block text-[10px] font-normal text-slate-400">{item.totalStock.toLocaleString("pt-BR")} na rede</span>}</td>
                      <td className="max-w-64 px-3 py-2.5 text-[11px] text-slate-500 dark:text-slate-400"><span className="block truncate">{item.topStores.length ? item.topStores.map((row) => `${row.label} (${row.available.toLocaleString("pt-BR")})`).join(" · ") : "—"}</span>{item.storesWithStock > item.topStores.length && <span className="text-[10px]">+{item.storesWithStock - item.topStores.length} loja(s)</span>}</td>
                      <td className="px-4 py-2.5"><StockBadge status={item.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">Mostrando {from.toLocaleString("pt-BR")}–{to.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} produtos</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                Por página
                <span className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
                  {CATALOG_PAGE_SIZES.map((size) => (
                    <button key={size} type="button" aria-pressed={pageSize === size} onClick={() => { setPageSize(size); setPage(1); }} className={`h-7 min-w-8 cursor-pointer rounded-md px-2 text-xs font-semibold ${pageSize === size ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}>{size}</button>
                  ))}
                </span>
              </label>
              <nav aria-label="Paginação" className="flex items-center gap-1">
                <button type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"><ChevronLeft className="h-3.5 w-3.5" /> Anterior</button>
                {pageList(data.page, data.pages).map((value, index) => value === "..." ? (
                  <span key={`gap-${index}`} className="px-1 text-xs text-slate-400">…</span>
                ) : (
                  <button key={value} type="button" aria-current={value === data.page ? "page" : undefined} onClick={() => setPage(value)} className={`h-8 min-w-8 cursor-pointer rounded-lg px-2 text-xs font-semibold tabular-nums ${value === data.page ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"}`}>{value}</button>
                ))}
                <button type="button" disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">Próxima <ChevronRight className="h-3.5 w-3.5" /></button>
              </nav>
            </div>
          </footer>
        </div>
      )}

      {openCode && <ProductDetailDialog code={openCode} onClose={() => setOpenCode(null)} />}
    </div>
  );
}
