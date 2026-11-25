"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, CopyPlus, Hash, RefreshCw, Save, Search, Store, Tag, Target, Users, Wallet } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { Pagination, SegmentedControl, cardClass } from "@/components/dashboard/DashboardKit";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { MoneyInput, QuantityInput } from "@/components/NumericInputs";
import { formatGoal, goalMonthKey, goalProgress, monthLabel, paginate, shiftMonth, storeGoals, storeLabel, type GoalMetric, type GoalSeller } from "@/lib/seller-goals-shared";

type BrandRow = { key: string; label: string; goal: number; goalQty: number; soldAmount: number; soldQty: number; sales90d: number };
type MonthData = { month: string; company: { global: number; brands: BrandRow[] }; sellers: GoalSeller[]; total: number; syncedAt: string | null };
type View = "vendedores" | "marcas";
type Draft = { amount?: number; quantity?: number };

const PAGE_SIZES = [10, 15, 25, 50];
const money = (value: number) => formatGoal("VALOR", value);
const dateLabel = (value: string | null) => (value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "—");

/** Aplica o rascunho (o que está sendo digitado) sobre o valor salvo. */
function withDraft<T extends { goal: number; goalQty: number }>(item: T, draft: Draft | undefined): T {
  if (!draft) return item;
  return { ...item, goal: draft.amount ?? item.goal, goalQty: draft.quantity ?? item.goalQty };
}
const isChanged = (item: { goal: number; goalQty: number }, draft: Draft | undefined) => !!draft && ((draft.amount !== undefined && draft.amount !== item.goal) || (draft.quantity !== undefined && draft.quantity !== item.goalQty));

export default function SellerGoalsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><LoadingSpinner label="Carregando metas..." size={32} /></div>}>
      <SellerGoals />
    </Suspense>
  );
}

/** /vendas/metas: meta mensal de cada vendedor em R$ e/ou quantidade de vendas; loja = soma dos vendedores; global = soma das lojas. */
function SellerGoals() {
  const toast = useToast();
  const params = useSearchParams();
  const [month, setMonth] = useState(() => goalMonthKey(params.get("mes")));
  const [metric, setMetric] = useState<GoalMetric>(() => (params.get("tipo") === "quantidade" ? "QUANTIDADE" : "VALOR"));
  const [view, setView] = useState<View>(() => (params.get("ver") === "marcas" ? "marcas" : "vendedores"));
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [page, setPage] = useState(() => Math.max(1, Number(params.get("page")) || 1));
  const [perPage, setPerPage] = useState(() => (PAGE_SIZES.includes(Number(params.get("por"))) ? Number(params.get("por")) : 15));
  const [data, setData] = useState<MonthData | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [brandDrafts, setBrandDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");

  // Estado da tela na URL (?page=2&por=15&q=ana&tipo=quantidade&ver=marcas&mes=2026-11): dá para recarregar e compartilhar.
  useEffect(() => {
    const next = new URLSearchParams();
    if (page > 1) next.set("page", String(page));
    if (perPage !== 15) next.set("por", String(perPage));
    if (query.trim()) next.set("q", query.trim());
    if (metric === "QUANTIDADE") next.set("tipo", "quantidade");
    if (view === "marcas") next.set("ver", "marcas");
    if (month !== goalMonthKey(null)) next.set("mes", month);
    const search = next.toString();
    if (`?${search}` !== window.location.search && !(search === "" && window.location.search === "")) window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  }, [page, perPage, query, metric, view, month]);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/vendas/metas?month=${target}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { data?: MonthData; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error ?? "Não foi possível carregar as metas.");
      setData(body.data);
      setDrafts({});
      setBrandDrafts({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as metas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [month, load]);

  const sellers = useMemo(() => (data?.sellers ?? []).map((seller) => withDraft(seller, drafts[seller.id])), [data, drafts]);
  const changedSellers = useMemo(() => (data?.sellers ?? []).filter((seller) => isChanged(seller, drafts[seller.id])), [data, drafts]);
  const brands = useMemo(() => (data?.company.brands ?? []).map((brand) => withDraft(brand, brandDrafts[brand.key])), [data, brandDrafts]);
  const changedBrands = useMemo(() => (data?.company.brands ?? []).filter((brand) => isChanged(brand, brandDrafts[brand.key])), [data, brandDrafts]);
  const changedCount = changedSellers.length + changedBrands.length;
  const stores = useMemo(() => storeGoals(sellers), [sellers]);
  const storeByNumber = useMemo(() => new Map(stores.map((store) => [store.storeNumber, store])), [stores]);

  // Meta global = soma das lojas (no tipo escolhido), com o realizado do mês.
  const company = goalProgress(metric, {
    goal: stores.reduce((sum, store) => sum + store.goal, 0),
    goalQty: stores.reduce((sum, store) => sum + store.goalQty, 0),
    soldAmount: stores.reduce((sum, store) => sum + store.soldAmount, 0),
    soldQty: stores.reduce((sum, store) => sum + store.soldQty, 0),
  });
  const hasGoal = (item: { goal: number; goalQty: number }) => (metric === "QUANTIDADE" ? item.goalQty : item.goal) > 0;
  const withGoal = sellers.filter(hasGoal).length;
  const brandTotal = goalProgress(metric, { goal: brands.reduce((sum, item) => sum + item.goal, 0), goalQty: brands.reduce((sum, item) => sum + item.goalQty, 0), soldAmount: 0, soldQty: 0 }).target;
  const fmt = (value: number, unit?: string) => formatGoal(metric, value, unit);

  const text = query.trim().toLowerCase();
  const sellerList = useMemo(
    () =>
      sellers
        .filter((seller) => !text || seller.name.toLowerCase().includes(text) || storeLabel(seller.storeNumber).toLowerCase().includes(text))
        .sort((a, b) => (a.storeNumber ?? Number.MAX_SAFE_INTEGER) - (b.storeNumber ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, "pt-BR")),
    [sellers, text],
  );
  const brandList = useMemo(() => brands.filter((brand) => !text || brand.label.toLowerCase().includes(text) || brand.key.toLowerCase().includes(text)), [brands, text]);
  const paged = paginate<GoalSeller | BrandRow>(view === "marcas" ? brandList : sellerList, page, perPage);
  // Página fora do limite (ex.: busca reduziu a lista): volta para a última válida.
  const currentPage = paged.page;

  const resetPage = () => setPage(1);
  const changeMonth = (delta: number) => {
    if (changedCount && !window.confirm("Há metas alteradas e não salvas. Trocar de mês e descartar?")) return;
    setMonth((current) => shiftMonth(current, delta));
  };

  const save = async () => {
    if (!changedCount) return;
    setSaving(true);
    try {
      const response = await fetch("/api/vendas/metas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          goals: changedSellers.map((seller) => ({ sellerId: seller.id, ...drafts[seller.id] })),
          company: { brands: changedBrands.map((brand) => ({ key: brand.key, label: brand.label, ...brandDrafts[brand.key] })) },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { data?: MonthData; saved?: number; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error ?? "Não foi possível salvar.");
      setData(body.data);
      setDrafts({});
      setBrandDrafts({});
      toast.success("Metas salvas", `${body.saved ?? changedCount} ${changedCount === 1 ? "meta atualizada" : "metas atualizadas"} em ${monthLabel(month).toLowerCase()}.`);
    } catch (cause) {
      toast.error("Metas não salvas", cause instanceof Error ? cause.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/vendas/metas/sync", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { data?: { total: number; created: number; deactivated: number }; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error ?? "Não foi possível atualizar.");
      toast.success("Vendedores atualizados", `${body.data.total} ativos no VMSET · ${body.data.created} novos · ${body.data.deactivated} inativados`);
      await load(month);
    } catch (cause) {
      toast.error("Vendedores não atualizados", cause instanceof Error ? cause.message : undefined);
    } finally {
      setSyncing(false);
    }
  };

  /** Preenche o que está sem meta (valor e quantidade) com a meta do mês anterior; só nos campos, precisa salvar. */
  const copyPrevious = async () => {
    setCopying(true);
    try {
      const previous = shiftMonth(month, -1);
      const response = await fetch(`/api/vendas/metas?month=${previous}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { data?: MonthData };
      let filled = 0;
      const fill = <T extends { goal: number; goalQty: number }>(current: T[], before: T[], keyOf: (item: T) => string, base: Record<string, Draft>) => {
        const old = new Map(before.map((item) => [keyOf(item), item]));
        const next = { ...base };
        for (const item of current) {
          const prior = old.get(keyOf(item));
          if (!prior) continue;
          const draft: Draft = { ...next[keyOf(item)] };
          if (item.goal <= 0 && prior.goal > 0) draft.amount = prior.goal;
          if (item.goalQty <= 0 && prior.goalQty > 0) draft.quantity = prior.goalQty;
          if (draft.amount !== undefined || draft.quantity !== undefined) {
            next[keyOf(item)] = draft;
            filled += 1;
          }
        }
        return next;
      };
      setDrafts(fill(sellers, body.data?.sellers ?? [], (item) => item.id, drafts));
      setBrandDrafts(fill(brands, body.data?.company.brands ?? [], (item) => item.key, brandDrafts));
      if (filled) toast.success(`${filled} metas copiadas de ${monthLabel(previous).toLowerCase()}`, "Confira e clique em Salvar.");
      else toast.error("Nada para copiar", `Nada sem meta neste mês tinha meta em ${monthLabel(previous).toLowerCase()}.`);
    } finally {
      setCopying(false);
    }
  };

  const setGoal = (setter: typeof setDrafts, key: string, value: number) => setter((current) => ({ ...current, [key]: { ...current[key], [metric === "QUANTIDADE" ? "quantity" : "amount"]: value } }));

  const button = "inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const goalInput = (label: string, value: number, dirty: boolean, onValue: (value: number) => void) => {
    const shell = `h-10 w-40 shrink-0 rounded-xl border px-3 text-right text-sm font-bold tabular-nums text-slate-900 outline-none transition-colors focus:border-[#002187] dark:text-white dark:focus:border-[#C4D600] ${dirty ? "border-[#C4D600] bg-[#C4D600]/10" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.04]"}`;
    return metric === "QUANTIDADE" ? <QuantityInput value={value} onValueChange={onValue} aria-label={label} placeholder="0" className={shell} /> : <MoneyInput value={value} onValueChange={onValue} aria-label={label} className={shell} />;
  };
  const progressBar = (item: { goal: number; goalQty: number; soldAmount: number; soldQty: number }, unit?: string) => {
    const progress = goalProgress(metric, item);
    return (
      <div className="mt-1.5">
        <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
          <span>{progress.target > 0 ? `${fmt(progress.done, unit)} de ${fmt(progress.target, unit)}` : `${fmt(progress.done, unit)} no mês · sem meta`}</span>
          {progress.target > 0 && <span className={`font-bold ${progress.percent >= 100 ? "text-[#5d6600] dark:text-[#C4D600]" : "text-slate-600 dark:text-slate-300"}`}>{progress.percent}%</span>}
        </div>
        {progress.target > 0 && (
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div className={`h-full rounded-full ${progress.percent >= 100 ? "bg-[#C4D600]" : "bg-gradient-to-r from-[#002187] to-[#C4D600]"}`} style={{ width: `${Math.min(100, progress.percent)}%` }} />
          </div>
        )}
      </div>
    );
  };

  // Vendedores da página agrupados por loja (o cabeçalho mostra a soma da loja inteira, não só da página).
  const pageGroups = useMemo(() => {
    if (view !== "vendedores") return [];
    const groups: { storeNumber: number | null; rows: GoalSeller[] }[] = [];
    for (const seller of paged.items as GoalSeller[]) {
      const last = groups.at(-1);
      if (last && last.storeNumber === seller.storeNumber) last.rows.push(seller);
      else groups.push({ storeNumber: seller.storeNumber, rows: [seller] });
    }
    return groups;
  }, [paged.items, view]);

  return (
    <main className="w-full min-w-0 space-y-4 px-3 pb-24 pt-4 md:px-6 md:pt-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F7915E]">Vendas</p>
          <h1 className="text-2xl font-bold tracking-tight text-[#051647] dark:text-white">Metas de vendedores</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Meta mensal de cada vendedor em R$ ou em quantidade de vendas. A loja soma os vendedores e a empresa soma as lojas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void sync()} disabled={syncing} title="Busca no VMSET os vendedores ativos com venda nos últimos 60 dias" className={`${button} border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5`}>
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />Atualizar vendedores
          </button>
          <button type="button" onClick={() => void save()} disabled={!changedCount || saving} className={`${button} bg-[#051647] text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]`}>
            <Save className="h-4 w-4" />{saving ? "Salvando..." : changedCount ? `Salvar (${changedCount})` : "Salvar"}
          </button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[auto_1.3fr_1fr_1fr]">
        <div className={`${cardClass} flex flex-col justify-center gap-2 p-2`}>
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => changeMonth(-1)} aria-label="Mês anterior" className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><ChevronLeft className="h-5 w-5" /></button>
            <span className="min-w-[150px] text-center text-sm font-bold text-[#051647] dark:text-white">{monthLabel(month)}</span>
            <button type="button" onClick={() => changeMonth(1)} aria-label="Próximo mês" className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><ChevronRight className="h-5 w-5" /></button>
          </div>
          <div className="flex justify-center">
            <SegmentedControl<GoalMetric> label="Tipo de meta" value={metric} onChange={(value) => { setMetric(value); resetPage(); }} options={[{ value: "VALOR", label: "Valor em R$" }, { value: "QUANTIDADE", label: "Quantidade de vendas" }]} />
          </div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-[#07163B] to-[#0D255E] p-4 text-white shadow">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/70">{metric === "QUANTIDADE" ? <Hash className="h-4 w-4 text-[#C4D600]" /> : <Target className="h-4 w-4 text-[#C4D600]" />}Meta global da empresa</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums">{fmt(company.target)}</p>
          <p className="mt-0.5 text-[11px] text-white/70">Soma das lojas · realizado {fmt(company.done)}{company.target > 0 ? ` (${company.percent}%)` : ""}</p>
          {company.target > 0 && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#C4D600]" style={{ width: `${Math.min(100, company.percent)}%` }} /></div>}
        </div>
        <div className={`${cardClass} p-4`}>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"><Store className="h-4 w-4 text-[#F7915E]" />Lojas com meta</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[#051647] dark:text-white">{stores.filter(hasGoal).length}<span className="text-sm font-medium text-slate-400"> de {stores.length}</span></p>
        </div>
        <div className={`${cardClass} p-4`}>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"><Users className="h-4 w-4 text-[#F7915E]" />Vendedores com meta</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[#051647] dark:text-white">{withGoal}<span className="text-sm font-medium text-slate-400"> de {sellers.length}</span></p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<View> label="Metas de" value={view} onChange={(value) => { setView(value); resetPage(); }} options={[{ value: "vendedores", label: "Vendedores & lojas" }, { value: "marcas", label: `Marcas${brandTotal > 0 ? ` · ${formatGoal(metric, brandTotal, "un.")}` : ""}` }]} />
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => { setQuery(event.target.value); resetPage(); }} placeholder={view === "marcas" ? "Buscar marca..." : "Buscar vendedor ou loja..."} aria-label={view === "marcas" ? "Buscar marca" : "Buscar vendedor ou loja"} className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#002187] dark:border-white/10 dark:bg-white/[0.04] dark:text-white" />
        </label>
        <button type="button" onClick={() => void copyPrevious()} disabled={copying || loading} title="Preenche quem está sem meta com a meta do mês anterior" className={`${button} border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5`}>
          <CopyPlus className="h-4 w-4" />Copiar do mês anterior
        </button>
        {data?.syncedAt && <span className="text-[11px] text-slate-400">Vendedores do VMSET atualizados em {new Date(data.syncedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

      {loading && !data ? (
        <div className="flex justify-center py-16"><LoadingSpinner label="Carregando metas..." size={32} /></div>
      ) : view === "vendedores" && sellers.length === 0 ? (
        <p className={`${cardClass} p-8 text-center text-sm text-slate-500`}>Nenhum vendedor cadastrado ainda. Clique em &quot;Atualizar vendedores&quot; para trazer os vendedores ativos do VMSET.</p>
      ) : (
        <section className={`${cardClass} min-w-0 overflow-hidden`}>
          {view === "marcas" && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/5">
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-bold text-[#051647] dark:text-white"><Tag className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" />Metas por marca</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Meta da empresa inteira para cada marca no mês{metric === "QUANTIDADE" ? " em unidades (peças)" : ""} · em ordem de venda nos últimos 90 dias</span>
              </span>
              <span className="text-lg font-extrabold tabular-nums text-[#051647] dark:text-white">{formatGoal(metric, brandTotal, "un.")}</span>
            </div>
          )}

          {paged.total === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">{view === "marcas" ? "Nenhuma marca encontrada." : "Nenhum vendedor encontrado."}</p>
          ) : view === "marcas" ? (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {(paged.items as BrandRow[]).map((brand) => (
                <li key={brand.key} className="flex min-w-0 items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold text-slate-800 dark:text-slate-100">{brand.label} <span className="text-[11px] font-normal text-slate-400">· {money(brand.sales90d)} em 90 dias</span></p>
                    {progressBar(brand, "un.")}
                  </div>
                  {goalInput(`Meta da marca ${brand.label}`, metric === "QUANTIDADE" ? brand.goalQty : brand.goal, changedBrands.some((item) => item.key === brand.key), (value) => setGoal(setBrandDrafts, brand.key, value))}
                </li>
              ))}
            </ul>
          ) : (
            pageGroups.map((group) => {
              const store = storeByNumber.get(group.storeNumber);
              return (
                <div key={`${group.storeNumber}-${group.rows[0].id}`}>
                  <div className="flex items-center justify-between gap-3 border-y border-slate-100 bg-slate-50/70 px-4 py-2.5 first:border-t-0 dark:border-white/5 dark:bg-white/[0.02]">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-bold text-[#051647] dark:text-white"><Store className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" />{storeLabel(group.storeNumber)}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">{store?.withGoal ?? 0} de {store?.sellers ?? 0} vendedores com meta · realizado {fmt(goalProgress(metric, store ?? { goal: 0, goalQty: 0, soldAmount: 0, soldQty: 0 }).done)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-lg font-extrabold tabular-nums text-[#051647] dark:text-white">{metric === "QUANTIDADE" ? <Hash className="h-4 w-4 text-slate-400" /> : <Wallet className="h-4 w-4 text-slate-400" />}{fmt(metric === "QUANTIDADE" ? store?.goalQty ?? 0 : store?.goal ?? 0)}</span>
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-white/5">
                    {group.rows.map((seller) => (
                      <li key={seller.id} className="flex min-w-0 items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                            <span className="break-words">{seller.name}</span>
                            {!seller.active && <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-px text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400">Inativo</span>}
                            <span className="text-[11px] font-normal text-slate-400">
                              · última venda {dateLabel(seller.lastSaleAt)}
                              {seller.stores.length > 1 && ` · vende também em ${seller.stores.filter((number) => number !== seller.storeNumber).map((number) => `Loja ${number}`).join(", ")}`}
                            </span>
                          </p>
                          {progressBar(seller)}
                        </div>
                        {goalInput(`Meta de ${seller.name}`, metric === "QUANTIDADE" ? seller.goalQty : seller.goal, changedSellers.some((item) => item.id === seller.id), (value) => setGoal(setDrafts, seller.id, value))}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}

          <Pagination
            page={currentPage - 1}
            pageSize={perPage}
            total={paged.total}
            noun={view === "marcas" ? "marcas" : "metas"}
            onChange={(next) => setPage(next + 1)}
            pageSizes={PAGE_SIZES}
            onPageSizeChange={(size) => { setPerPage(size); resetPage(); }}
            edges
            className="border-t border-slate-100 px-4 py-3 dark:border-white/5"
          />
        </section>
      )}

      {changedCount > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100vw-24px)] items-center gap-3 rounded-2xl bg-[#051647] px-4 py-2.5 text-white shadow-2xl">
          <span className="text-sm">{changedCount} {changedCount === 1 ? "meta alterada" : "metas alteradas"}</span>
          <button type="button" onClick={() => { setDrafts({}); setBrandDrafts({}); }} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white">Descartar</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#C4D600] px-3 py-1.5 text-xs font-bold text-[#051647] disabled:opacity-60"><Save className="h-3.5 w-3.5" />{saving ? "Salvando..." : "Salvar"}</button>
        </div>
      )}
    </main>
  );
}
