"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, CopyPlus, RefreshCw, Save, Search, Store, Tag, Target, Users } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { SegmentedControl, cardClass } from "@/components/dashboard/DashboardKit";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { goalMonthKey, monthLabel, parseGoalAmount, shiftMonth, storeGoals, storeLabel, type GoalSeller } from "@/lib/seller-goals-shared";

type BrandRow = { key: string; label: string; goal: number; sales90d: number };
type MonthData = { month: string; company: { global: number; brands: BrandRow[] }; sellers: GoalSeller[]; total: number; syncedAt: string | null };
type View = "vendedores" | "marcas";
const BRANDS_SHOWN = 15;

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const inputValue = (value: number) => (value > 0 ? value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "");
const dateLabel = (value: string | null) => (value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "—");

/** /vendas/metas: meta mensal de cada vendedor; a meta da loja é a soma das metas dos vendedores da loja. */
export default function SellerGoalsPage() {
  const toast = useToast();
  const [month, setMonth] = useState(() => goalMonthKey(null));
  const [data, setData] = useState<MonthData | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<View>("vendedores");
  const [brandDrafts, setBrandDrafts] = useState<Record<string, string>>({});
  const [brandQuery, setBrandQuery] = useState("");
  const [allBrands, setAllBrands] = useState(false);

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

  // Valor em edição tem prioridade sobre o salvo: a soma da loja acompanha enquanto digita.
  const sellers = useMemo(() => (data?.sellers ?? []).map((seller) => (seller.id in drafts ? { ...seller, goal: parseGoalAmount(drafts[seller.id]) } : seller)), [data, drafts]);
  const changedSellers = useMemo(() => (data?.sellers ?? []).filter((seller) => seller.id in drafts && parseGoalAmount(drafts[seller.id]) !== seller.goal), [data, drafts]);
  const brands = useMemo(() => (data?.company.brands ?? []).map((brand) => (brand.key in brandDrafts ? { ...brand, goal: parseGoalAmount(brandDrafts[brand.key]) } : brand)), [data, brandDrafts]);
  const changedBrands = useMemo(() => (data?.company.brands ?? []).filter((brand) => brand.key in brandDrafts && parseGoalAmount(brandDrafts[brand.key]) !== brand.goal), [data, brandDrafts]);
  // Contador de alterações: vendedores + marcas. A meta global é sempre a soma das lojas (não se digita).
  const changed = useMemo(() => [...changedSellers.map((seller) => seller.id), ...changedBrands.map((brand) => `marca:${brand.key}`)], [changedSellers, changedBrands]);
  const brandTotal = brands.reduce((sum, brand) => sum + brand.goal, 0);
  const brandText = brandQuery.trim().toLowerCase();
  const brandList = brandText
    ? brands.filter((brand) => brand.label.toLowerCase().includes(brandText) || brand.key.toLowerCase().includes(brandText))
    : allBrands ? brands : brands.filter((brand, index) => index < BRANDS_SHOWN || brand.goal > 0 || brand.key in brandDrafts);
  const stores = useMemo(() => storeGoals(sellers), [sellers]);
  const total = sellers.reduce((sum, seller) => sum + seller.goal, 0);
  const withGoal = sellers.filter((seller) => seller.goal > 0).length;
  const text = query.trim().toLowerCase();
  const visible = text ? sellers.filter((seller) => seller.name.toLowerCase().includes(text) || storeLabel(seller.storeNumber).toLowerCase().includes(text)) : sellers;

  const changeMonth = (delta: number) => {
    if (changed.length && !window.confirm("Há metas alteradas e não salvas. Trocar de mês e descartar?")) return;
    setMonth((current) => shiftMonth(current, delta));
  };

  const save = async () => {
    if (!changed.length) return;
    setSaving(true);
    try {
      const response = await fetch("/api/vendas/metas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          goals: changedSellers.map((seller) => ({ sellerId: seller.id, amount: parseGoalAmount(drafts[seller.id]) })),
          company: {
            brands: changedBrands.map((brand) => ({ key: brand.key, label: brand.label, amount: parseGoalAmount(brandDrafts[brand.key]) })),
          },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { data?: MonthData; saved?: number; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error ?? "Não foi possível salvar.");
      setData(body.data);
      setDrafts({});
      setBrandDrafts({});
      toast.success("Metas salvas", `${body.saved ?? changed.length} ${changed.length === 1 ? "meta atualizada" : "metas atualizadas"} em ${monthLabel(month).toLowerCase()}.`);
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

  /** Preenche quem está sem meta com a meta do mês anterior (só no campo; precisa salvar). */
  const copyPrevious = async () => {
    setCopying(true);
    try {
      const previous = shiftMonth(month, -1);
      const response = await fetch(`/api/vendas/metas?month=${previous}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { data?: MonthData };
      const before = new Map((body.data?.sellers ?? []).filter((seller) => seller.goal > 0).map((seller) => [seller.id, seller.goal]));
      const next: Record<string, string> = { ...drafts };
      let filled = 0;
      for (const seller of sellers) {
        const goal = before.get(seller.id);
        if (goal && seller.goal <= 0) {
          next[seller.id] = inputValue(goal);
          filled += 1;
        }
      }
      setDrafts(next);
      // Marcas sem valor também herdam do mês anterior.
      const brandsBefore = new Map((body.data?.company.brands ?? []).filter((brand) => brand.goal > 0).map((brand) => [brand.key, brand.goal]));
      const nextBrands: Record<string, string> = { ...brandDrafts };
      for (const brand of brands) {
        const goal = brandsBefore.get(brand.key);
        if (goal && brand.goal <= 0) {
          nextBrands[brand.key] = inputValue(goal);
          filled += 1;
        }
      }
      setBrandDrafts(nextBrands);
      if (filled) toast.success(`${filled} metas copiadas de ${monthLabel(previous).toLowerCase()}`, "Confira e clique em Salvar.");
      else toast.error("Nada para copiar", `Nada sem meta neste mês tinha meta em ${monthLabel(previous).toLowerCase()}.`);
    } finally {
      setCopying(false);
    }
  };

  const button = "inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <main className="w-full min-w-0 space-y-4 px-3 pb-24 pt-4 md:px-6 md:pt-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F7915E]">Vendas</p>
          <h1 className="text-2xl font-bold tracking-tight text-[#051647] dark:text-white">Metas de vendedores</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Meta mensal de cada vendedor. A meta da loja é a soma das metas dos vendedores dela.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void sync()} disabled={syncing} title="Busca no VMSET os vendedores ativos com venda nos últimos 60 dias" className={`${button} border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5`}>
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />Atualizar vendedores
          </button>
          <button type="button" onClick={() => void save()} disabled={!changed.length || saving} className={`${button} bg-[#051647] text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]`}>
            <Save className="h-4 w-4" />{saving ? "Salvando..." : changed.length ? `Salvar (${changed.length})` : "Salvar"}
          </button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-[auto_1fr_1fr_1fr]">
        <div className={`${cardClass} flex items-center justify-between gap-2 p-2`}>
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Mês anterior" className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><ChevronLeft className="h-5 w-5" /></button>
          <span className="min-w-[150px] text-center text-sm font-bold text-[#051647] dark:text-white">{monthLabel(month)}</span>
          <button type="button" onClick={() => changeMonth(1)} aria-label="Próximo mês" className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><ChevronRight className="h-5 w-5" /></button>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-[#07163B] to-[#0D255E] p-4 text-white shadow">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/70"><Target className="h-4 w-4 text-[#C4D600]" />Meta global da empresa</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums">{money(total)}</p>
          <p className="mt-0.5 text-[11px] text-white/70">Soma das metas de todas as lojas</p>
        </div>
        <div className={`${cardClass} p-4`}>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"><Store className="h-4 w-4 text-[#F7915E]" />Lojas com meta</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[#051647] dark:text-white">{stores.filter((store) => store.goal > 0).length}<span className="text-sm font-medium text-slate-400"> de {stores.length}</span></p>
        </div>
        <div className={`${cardClass} p-4`}>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"><Users className="h-4 w-4 text-[#F7915E]" />Vendedores com meta</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[#051647] dark:text-white">{withGoal}<span className="text-sm font-medium text-slate-400"> de {sellers.length}</span></p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<View> label="Tipo de meta" value={view} onChange={setView} options={[{ value: "vendedores", label: "Vendedores & lojas" }, { value: "marcas", label: `Marcas${brandTotal > 0 ? ` · ${money(brandTotal)}` : ""}` }]} />
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          {view === "vendedores" ? (
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar vendedor ou loja..." aria-label="Buscar vendedor ou loja" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#002187] dark:border-white/10 dark:bg-white/[0.04] dark:text-white" />
          ) : (
            <input value={brandQuery} onChange={(event) => setBrandQuery(event.target.value)} placeholder="Buscar marca..." aria-label="Buscar marca" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#002187] dark:border-white/10 dark:bg-white/[0.04] dark:text-white" />
          )}
        </label>
        <button type="button" onClick={() => void copyPrevious()} disabled={copying || loading} title="Preenche quem está sem meta com a meta do mês anterior" className={`${button} border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5`}>
          <CopyPlus className="h-4 w-4" />Copiar do mês anterior
        </button>
        {data?.syncedAt && <span className="text-[11px] text-slate-400">Vendedores do VMSET atualizados em {new Date(data.syncedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

      {loading && !data ? (
        <div className="flex justify-center py-16"><LoadingSpinner label="Carregando metas..." size={32} /></div>
      ) : view === "marcas" ? (
        <section className={`${cardClass} min-w-0 overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/5">
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-bold text-[#051647] dark:text-white"><Tag className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" />Metas por marca</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Meta da empresa inteira para cada marca no mês · marcas em ordem de venda nos últimos 90 dias</span>
            </span>
            <span className="text-lg font-extrabold tabular-nums text-[#051647] dark:text-white">{money(brandTotal)}</span>
          </div>
          {brandList.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">Nenhuma marca encontrada.</p>
          ) : (
            <ul className="grid divide-y divide-slate-100 dark:divide-white/5 lg:grid-cols-2 lg:divide-y-0">
              {brandList.map((brand) => {
                const dirty = changedBrands.some((item) => item.key === brand.key);
                return (
                  <li key={brand.key} className="flex min-w-0 items-center gap-3 px-4 py-2.5 lg:border-b lg:border-slate-100 lg:odd:border-r dark:lg:border-white/5">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold text-slate-800 dark:text-slate-100">{brand.label}</p>
                      <p className="text-[11px] text-slate-400">{money(brand.sales90d)} vendidos em 90 dias</p>
                    </div>
                    <label className={`flex h-10 w-40 shrink-0 items-center gap-1 rounded-xl border px-3 transition-colors focus-within:border-[#002187] dark:focus-within:border-[#C4D600] ${dirty ? "border-[#C4D600] bg-[#C4D600]/10" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.04]"}`}>
                      <span className="text-xs font-semibold text-slate-400">R$</span>
                      <input
                        inputMode="decimal"
                        value={brand.key in brandDrafts ? brandDrafts[brand.key] : inputValue(brand.goal)}
                        onChange={(event) => setBrandDrafts((current) => ({ ...current, [brand.key]: event.target.value }))}
                        placeholder="0"
                        aria-label={`Meta da marca ${brand.label}`}
                        className="min-w-0 flex-1 bg-transparent! text-right text-sm font-bold tabular-nums text-slate-900 outline-none dark:text-white"
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {!brandText && brands.length > BRANDS_SHOWN && (
            <button type="button" onClick={() => setAllBrands((value) => !value)} className="w-full cursor-pointer border-t border-slate-100 py-2.5 text-xs font-semibold text-[#002187] hover:bg-slate-50 dark:border-white/5 dark:text-[#C4D600] dark:hover:bg-white/5">
              {allBrands ? "Mostrar só as principais" : `Mostrar todas as ${brands.length} marcas`}
            </button>
          )}
        </section>
      ) : sellers.length === 0 ? (
        <p className={`${cardClass} p-8 text-center text-sm text-slate-500`}>Nenhum vendedor cadastrado ainda. Clique em &quot;Atualizar vendedores&quot; para trazer os vendedores ativos do VMSET.</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {stores.map((store) => {
            const key = String(store.storeNumber);
            const rows = visible.filter((seller) => seller.storeNumber === store.storeNumber);
            if (!rows.length) return null;
            const open = !collapsed[key] || !!text;
            return (
              <section key={key} className={`${cardClass} min-w-0 overflow-hidden`}>
                <button type="button" onClick={() => setCollapsed((current) => ({ ...current, [key]: open }))} aria-expanded={open} className="flex w-full cursor-pointer items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left dark:border-white/5">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-bold text-[#051647] dark:text-white"><Store className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" />{store.label}</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">{store.withGoal} de {store.sellers} vendedores com meta · soma das metas</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-lg font-extrabold tabular-nums text-[#051647] dark:text-white">{money(store.goal)}</span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
                  </span>
                </button>
                {open && (
                  <ul className="divide-y divide-slate-100 dark:divide-white/5">
                    {rows.map((seller) => {
                      const dirty = changedSellers.some((item) => item.id === seller.id);
                      return (
                        <li key={seller.id} className="flex min-w-0 items-center gap-3 px-4 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                              <span className="break-words">{seller.name}</span>
                              {!seller.active && <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-px text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400">Inativo</span>}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              Última venda {dateLabel(seller.lastSaleAt)} · {money(seller.sales60d)} em 60 dias
                              {seller.stores.length > 1 && ` · vende também em ${seller.stores.filter((number) => number !== seller.storeNumber).map((number) => `Loja ${number}`).join(", ")}`}
                            </p>
                          </div>
                          <label className={`flex h-10 w-40 shrink-0 items-center gap-1 rounded-xl border px-3 transition-colors focus-within:border-[#002187] dark:focus-within:border-[#C4D600] ${dirty ? "border-[#C4D600] bg-[#C4D600]/10" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.04]"}`}>
                            <span className="text-xs font-semibold text-slate-400">R$</span>
                            <input
                              inputMode="decimal"
                              value={seller.id in drafts ? drafts[seller.id] : inputValue(seller.goal)}
                              onChange={(event) => setDrafts((current) => ({ ...current, [seller.id]: event.target.value }))}
                              placeholder="0"
                              aria-label={`Meta de ${seller.name}`}
                              className="min-w-0 flex-1 bg-transparent! text-right text-sm font-bold tabular-nums text-slate-900 outline-none dark:text-white"
                            />
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {changed.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100vw-24px)] items-center gap-3 rounded-2xl bg-[#051647] px-4 py-2.5 text-white shadow-2xl">
          <span className="text-sm">{changed.length} {changed.length === 1 ? "meta alterada" : "metas alteradas"}</span>
          <button type="button" onClick={() => { setDrafts({}); setBrandDrafts({}); }} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white">Descartar</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#C4D600] px-3 py-1.5 text-xs font-bold text-[#051647] disabled:opacity-60"><Save className="h-3.5 w-3.5" />{saving ? "Salvando..." : "Salvar"}</button>
        </div>
      )}
    </main>
  );
}
