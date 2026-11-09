"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, Check, GitCompareArrows, HeartPulse, Inbox, MessageCircle, Moon, Receipt, RefreshCw, RotateCcw, ShieldAlert, Sparkles, Store, TrendingUp, UserRound, UserRoundX, Users } from "lucide-react";
import { useCrmTheme } from "@/hooks/useCrmTheme";
import { NewConversationDialog } from "@/components/chat/NewConversationDialog";
import type { CompareMode, CustomerDashboard, CustomerPeriodPreset, HealthSegment } from "@/lib/customer-dashboard";

type Options = { stores: { id: string; name: string }[]; sellers: string[] };
type Filters = { preset: CustomerPeriodPreset; start: string; end: string; compare: CompareMode; store: string; seller: string; inactiveDays: number };
type RiskRow = CustomerDashboard["risk"][number];

const PRESET_LABELS: Record<CustomerPeriodPreset, string> = { "30d": "Últimos 30 dias", month: "Mês atual", quarter: "Trimestre atual", custom: "Personalizado" };
const COMPARE_LABELS: Record<CompareMode, string> = { prev: "vs. período anterior", yoy: "vs. mesmo período do ano passado" };
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const SEGMENTS: Record<HealthSegment, { label: string; text: string; icon: React.ElementType; tone: string; bar: string; badge: string }> = {
  promotor: { label: "Ativos e promotores", text: "Compraram recentemente e voltam a comprar ou avaliam bem.", icon: Sparkles, tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300", bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20" },
  ativo: { label: "Ativos recentes", text: "Compraram dentro do prazo, ainda sem recompra ou avaliação.", icon: TrendingUp, tone: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300", bar: "bg-indigo-500", badge: "bg-indigo-50 text-indigo-700 ring-indigo-200/70 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20" },
  risco: { label: "Em risco de churn", text: "Compravam com regularidade e pararam (até 2 anos sem comprar).", icon: AlertTriangle, tone: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300", bar: "bg-amber-400", badge: "bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20" },
  critico: { label: "Insatisfeitos / críticos", text: "Última avaliação de atendimento com nota 1, 2 ou 3.", icon: ShieldAlert, tone: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300", bar: "bg-rose-400", badge: "bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20" },
  dormente: { label: "Dormentes", text: "Compra única antiga ou mais de 2 anos sem comprar.", icon: Moon, tone: "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400", bar: "bg-slate-300 dark:bg-slate-600", badge: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10" },
};

const todayBrt = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const formatDay = (day: string) => day.split("-").reverse().join("/");
const formatInt = (value: number) => Math.round(value).toLocaleString("pt-BR");
const formatMoney = (value: number | null, digits = 0) => value === null ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits });
const formatPercent = (value: number | null) => value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]}/${month.slice(2, 4)}`;
const daysSince = (day: string) => Math.max(0, Math.round((Date.parse(todayBrt()) - Date.parse(day)) / 86_400_000));
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
const formatPhone = (phone: string | null) => {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone ?? "";
};

/** Variação percentual contra o período de comparação; lowerIsBetter para inativos e insatisfação. */
function Delta({ value, previous, lowerIsBetter = false, points = false }: { value: number | null; previous: number | null; lowerIsBetter?: boolean; points?: boolean }) {
  if (value === null || previous === null || (!points && previous === 0)) return <span className="text-[11px] text-slate-400 dark:text-slate-500">sem comparação</span>;
  const change = points ? value - previous : ((value - previous) / previous) * 100;
  if (Math.abs(change) < 0.5) return <span className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-white/5 dark:text-slate-400">estável</span>;
  const good = lowerIsBetter ? change < 0 : change > 0;
  const Icon = change > 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${good ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"}`}>
      <Icon className="h-3 w-3" />{Math.abs(change).toLocaleString("pt-BR", { maximumFractionDigits: points ? 1 : 0 })}{points ? " p.p." : "%"}
    </span>
  );
}

const cardClass = "rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/[0.06] dark:bg-[#0a1b4d]";

function KpiCard({ icon: Icon, label, value, tone, hint, children }: { icon: React.ElementType; label: string; value: string; tone: string; hint: string; children?: React.ReactNode }) {
  return (
    <section className={`${cardClass} flex flex-col p-5`} aria-label={label} title={hint}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-2 text-[28px] font-semibold leading-none tabular-nums tracking-tight text-slate-900 dark:text-white">{value}</p>
      <div className="mt-3 flex flex-1 flex-col justify-end gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">{children}</div>
    </section>
  );
}

function PanelHeader({ icon: Icon, title, subtitle, children }: { icon: React.ElementType; title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-300"><Icon className="h-4 w-4" /></span>
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center dark:border-white/10">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-500"><Icon className="h-5 w-5" /></span>
      <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">{text}</p>
    </div>
  );
}

const Skel = ({ className, style }: { className: string; style?: React.CSSProperties }) => <div className={`animate-pulse rounded-md bg-slate-200/70 dark:bg-white/[0.06] ${className}`} style={style} />;

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando painel">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className={`${cardClass} p-5`}>
            <div className="flex justify-between"><Skel className="h-4 w-28" /><Skel className="h-8 w-8 rounded-lg" /></div>
            <Skel className="mt-3 h-7 w-24" />
            <Skel className="mt-4 h-4 w-20 rounded-full" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className={`${cardClass} p-6 xl:col-span-3`}>
          <Skel className="h-5 w-56" /><Skel className="mt-2 h-3 w-72" />
          <div className="mt-6 flex h-60 items-end gap-3">
            {[45, 60, 52, 70, 64, 58, 75, 68, 80, 62, 72, 66].map((height, index) => <Skel key={index} className="flex-1 rounded-b-none rounded-t-md" style={{ height: `${height}%` }} />)}
          </div>
        </div>
        <div className={`${cardClass} space-y-4 p-6 xl:col-span-2`}>
          <Skel className="h-5 w-48" />
          {Array.from({ length: 5 }, (_, index) => <Skel key={index} className="h-12 w-full rounded-xl" />)}
        </div>
      </div>
      <div className={`${cardClass} space-y-3 p-6`}>
        <Skel className="h-5 w-56" />
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="flex items-center gap-3"><Skel className="h-9 w-9 rounded-full" /><Skel className="h-4 flex-1" /></div>)}
      </div>
    </div>
  );
}

type TooltipItem = { name?: string; value?: number | string; color?: string; dataKey?: string | number };

function ChartTooltip({ active, payload, label }: { active?: boolean; label?: string | number; payload?: TooltipItem[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[190px] rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 text-xs shadow-lg backdrop-blur dark:border-white/10 dark:bg-[#0d2160]/95">
      <p className="mb-1.5 font-semibold capitalize text-slate-900 dark:text-white">{label}</p>
      {payload.map((item) => (
        <div key={String(item.dataKey)} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>
          <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{item.dataKey === "churnRate" ? formatPercent(typeof item.value === "number" ? item.value : null) : formatInt(Number(item.value ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

const selectWrap = "flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 transition-colors hover:border-slate-300 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/15 dark:border-white/10 dark:bg-[#0a1b4d] dark:text-slate-200 dark:hover:border-white/20";
const selectInner = "min-w-0 max-w-[200px] cursor-pointer truncate bg-transparent outline-none dark:[color-scheme:dark]";
const actionButton = "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

export default function PainelPage() {
  const router = useRouter();
  const { isDark } = useCrmTheme();
  const [filters, setFilters] = useState<Filters>(() => ({ preset: "30d", start: todayBrt(), end: todayBrt(), compare: "prev", store: "", seller: "", inactiveDays: 90 }));
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: CustomerDashboard; options?: Options; error?: string } | null>(null);
  const [riskFilter, setRiskFilter] = useState<"all" | "risco" | "critico">("all");
  const [conversation, setConversation] = useState<string | null>(null);
  const [pipelineState, setPipelineState] = useState<Record<string, "saving" | "added" | "exists" | "error">>({});

  const query = useMemo(() => {
    const params = new URLSearchParams({ preset: filters.preset, compare: filters.compare, inactiveDays: String(filters.inactiveDays) });
    if (filters.preset === "custom") { params.set("start", filters.start); params.set("end", filters.end); }
    if (filters.store) params.set("store", filters.store);
    if (filters.seller) params.set("seller", filters.seller);
    return params.toString();
  }, [filters]);
  const requestKey = `${query}#${reloadToken}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dashboard/customers?${query}`, { signal: controller.signal, cache: reloadToken ? "no-store" : "default" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { data?: CustomerDashboard; options?: Options; error?: string } | null;
        if (!response.ok || !body?.data) throw new Error(body?.error ?? "Não foi possível carregar o painel.");
        setResult({ key: requestKey, data: body.data, options: body.options });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult((current) => ({ ...current, key: requestKey, error: error instanceof Error ? error.message : "Não foi possível carregar o painel." }));
      });
    return () => controller.abort();
  }, [query, reloadToken, requestKey]);

  const loading = result?.key !== requestKey;
  const data = result?.data;
  const options = result?.options;

  const addToReactivation = async (row: RiskRow) => {
    setPipelineState((current) => ({ ...current, [row.id]: "saving" }));
    try {
      const response = await fetch("/api/dashboard/customers/reactivate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: row.id }) });
      const body = await response.json().catch(() => null) as { added?: boolean } | null;
      if (!response.ok || !body) throw new Error();
      setPipelineState((current) => ({ ...current, [row.id]: body.added ? "added" : "exists" }));
    } catch {
      setPipelineState((current) => ({ ...current, [row.id]: "error" }));
    }
  };

  const colors = {
    newBuyers: isDark ? "#818cf8" : "#4f46e5",
    recurring: isDark ? "#34d399" : "#10b981",
    churn: isDark ? "#fb923c" : "#f97316",
    grid: isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.06)",
    tick: isDark ? "#64748b" : "#94a3b8",
  };
  const compareLabel = data ? (data.filters.compare === "yoy" ? "vs. ano passado" : "vs. anterior") : "";
  const timeline = (data?.timeline ?? []).map((item) => ({ ...item, label: monthLabel(item.month) }));
  const timelineTotal = timeline.reduce((sum, item) => sum + item.newBuyers + item.recurring + item.churned, 0);
  const segmentTotal = (data?.segments ?? []).reduce((sum, item) => sum + item.total, 0);
  const riskRows = (data?.risk ?? []).filter((row) => riskFilter === "all" || row.segment === riskFilter);

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-12 pt-8 sm:px-8">
      <header className="flex flex-col justify-between gap-4 2xl:flex-row 2xl:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Clientes e Relacionamento</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Base, recompra, retenção e satisfação com dados do CRM e das vendas do ERP
            {data && <span className="text-slate-400 dark:text-slate-500"> · {formatDay(data.period.startDay)} a {formatDay(data.period.endDay)} {COMPARE_LABELS[data.filters.compare]} ({formatDay(data.period.compareStart)} a {formatDay(data.period.compareEnd)})</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={selectWrap}>
            <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="sr-only">Período</span>
            <select value={filters.preset} onChange={(event) => setFilters((current) => ({ ...current, preset: event.target.value as CustomerPeriodPreset }))} className={selectInner}>
              {(Object.keys(PRESET_LABELS) as CustomerPeriodPreset[]).map((preset) => <option key={preset} value={preset}>{PRESET_LABELS[preset]}</option>)}
            </select>
          </label>
          {filters.preset === "custom" && (
            <div className={selectWrap}>
              <input type="date" aria-label="Data inicial" value={filters.start} max={filters.end} onChange={(event) => event.target.value && setFilters((current) => ({ ...current, start: event.target.value }))} className="cursor-pointer bg-transparent outline-none dark:[color-scheme:dark]" />
              <span className="text-xs text-slate-400">até</span>
              <input type="date" aria-label="Data final" value={filters.end} min={filters.start} max={todayBrt()} onChange={(event) => event.target.value && setFilters((current) => ({ ...current, end: event.target.value }))} className="cursor-pointer bg-transparent outline-none dark:[color-scheme:dark]" />
            </div>
          )}
          <label className={selectWrap}>
            <GitCompareArrows className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="sr-only">Comparar com</span>
            <select value={filters.compare} onChange={(event) => setFilters((current) => ({ ...current, compare: event.target.value as CompareMode }))} className={selectInner}>
              <option value="prev">Período anterior</option>
              <option value="yoy">Mesmo período do ano passado</option>
            </select>
          </label>
          <label className={selectWrap}>
            <Store className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="sr-only">Loja</span>
            <select value={filters.store} onChange={(event) => setFilters((current) => ({ ...current, store: event.target.value }))} className={selectInner}>
              <option value="">Todas as lojas</option>
              {options?.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
          <label className={selectWrap}>
            <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="sr-only">Vendedor</span>
            <select value={filters.seller} onChange={(event) => setFilters((current) => ({ ...current, seller: event.target.value }))} className={selectInner}>
              <option value="">Todos os vendedores</option>
              {options?.sellers.map((seller) => <option key={seller} value={seller}>{seller}</option>)}
            </select>
          </label>
          <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs dark:border-white/10 dark:bg-[#0a1b4d]" role="group" aria-label="Considerar inativo após">
            <span className="px-2 text-slate-400">Inativo há</span>
            {[30, 60, 90].map((days) => (
              <button key={days} type="button" onClick={() => setFilters((current) => ({ ...current, inactiveDays: days }))} aria-pressed={filters.inactiveDays === days} className={`h-full cursor-pointer rounded-md px-2.5 font-medium transition-colors ${filters.inactiveDays === days ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"}`}>+{days}d</button>
            ))}
          </div>
          <button type="button" onClick={() => setReloadToken((token) => token + 1)} disabled={loading} aria-label="Atualizar" title="Atualizar" className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-[#0a1b4d] dark:text-slate-300 dark:hover:bg-white/5">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {result?.error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{result.error}</p>}

      {!data && !result?.error && <DashboardSkeleton />}

      {data && (
        <div className={`space-y-6 transition-opacity duration-300 ${loading ? "pointer-events-none opacity-50" : ""}`} aria-busy={loading}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard icon={Users} tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300" label="Base de clientes" value={formatInt(data.kpis.base.total)} hint="Contatos únicos cadastrados no CRM (filtra pela loja do cadastro).">
              <div className="flex items-center justify-between gap-2">
                <span>Ativos no período</span>
                <b className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatPercent(data.kpis.base.total > 0 ? (data.kpis.buyers.value / data.kpis.base.total) * 100 : null)}</b>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${data.kpis.base.total > 0 ? Math.min(100, (data.kpis.buyers.value / data.kpis.base.total) * 100) : 0}%` }} /></div>
            </KpiCard>
            <KpiCard icon={TrendingUp} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300" label="Compraram no período" value={formatInt(data.kpis.buyers.value)} hint="Clientes distintos com pedido de venda no ERP dentro do período.">
              <div className="flex items-center gap-2"><Delta value={data.kpis.buyers.value} previous={data.kpis.buyers.previous} /><span>{compareLabel}</span></div>
              <span><b className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatInt(data.kpis.buyers.newBuyers)}</b> primeira compra · {formatInt(data.kpis.buyers.orders)} pedidos</span>
            </KpiCard>
            <KpiCard icon={UserRoundX} tone="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300" label={`Sem compra há +${data.filters.inactiveDays} dias`} value={formatInt(data.kpis.inactive.value)} hint="Clientes que já compraram e estão sem recompra no fim do período.">
              <div className="flex items-center gap-2"><Delta value={data.kpis.inactive.value} previous={data.kpis.inactive.previous} lowerIsBetter /><span>{compareLabel}</span></div>
              <div className="flex flex-wrap gap-1">
                {([["30", data.kpis.inactive.ranges.d30], ["60", data.kpis.inactive.ranges.d60], ["90", data.kpis.inactive.ranges.d90], ["365", data.kpis.inactive.ranges.d365]] as const).map(([days, total]) => (
                  <span key={days} className="rounded-md bg-slate-100 px-1.5 py-0.5 tabular-nums dark:bg-white/5">+{days}d <b className="font-semibold text-slate-700 dark:text-slate-200">{formatInt(total)}</b></span>
                ))}
              </div>
            </KpiCard>
            <KpiCard icon={HeartPulse} tone="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300" label="Índice de insatisfação" value={formatPercent(data.kpis.dissatisfaction.value)} hint="Avaliações de atendimento com nota 1, 2 ou 3 sobre o total respondido no período.">
              <div className="flex items-center gap-2"><Delta value={data.kpis.dissatisfaction.value} previous={data.kpis.dissatisfaction.previous} lowerIsBetter points /><span>{compareLabel}</span></div>
              <span><b className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatInt(data.kpis.dissatisfaction.detractors)}</b> notas baixas de {formatInt(data.kpis.dissatisfaction.answered)} avaliações</span>
            </KpiCard>
            <KpiCard icon={Receipt} tone="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300" label="Ticket médio por cliente" value={formatMoney(data.kpis.ticket.value)} hint="Faturamento do período dividido pelos clientes que compraram.">
              <div className="flex items-center gap-2"><Delta value={data.kpis.ticket.value} previous={data.kpis.ticket.previous} /><span>{compareLabel}</span></div>
              <span>Faturamento <b className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatMoney(data.kpis.ticket.revenue)}</b></span>
            </KpiCard>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <section className={`${cardClass} p-5 sm:p-6 xl:col-span-3`} aria-label="Evolução de compradores e inativos">
              <PanelHeader icon={TrendingUp} title="Compradores vs. inatividade" subtitle={`Últimos 12 meses: primeira compra, recompra e clientes que passaram de ${data.filters.inactiveDays} dias sem comprar.`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.newBuyers }} />Novos</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.recurring }} />Recorrentes</span>
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: colors.churn }} />Taxa de inatividade</span>
                </div>
              </PanelHeader>
              {timelineTotal === 0 ? <EmptyState icon={Inbox} title="Sem vendas no período" text="Nenhum pedido encontrado para a loja ou vendedor selecionado." /> : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={timeline} margin={{ top: 4, right: 0, left: -8, bottom: 0 }}>
                      <CartesianGrid stroke={colors.grid} vertical={false} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: colors.tick, fontSize: 11 }} dy={8} />
                      <YAxis yAxisId="count" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: colors.tick, fontSize: 11 }} width={48} tickFormatter={(value: number) => value >= 1000 ? `${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(value)} />
                      <YAxis yAxisId="rate" orientation="right" axisLine={false} tickLine={false} tick={{ fill: colors.tick, fontSize: 11 }} width={40} tickFormatter={(value: number) => `${value}%`} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)", radius: 6 }} />
                      <Bar yAxisId="count" isAnimationActive={false} dataKey="newBuyers" name="Novos compradores" stackId="buyers" fill={colors.newBuyers} maxBarSize={30} />
                      <Bar yAxisId="count" isAnimationActive={false} dataKey="recurring" name="Recorrentes" stackId="buyers" fill={colors.recurring} radius={[5, 5, 0, 0]} maxBarSize={30} />
                      <Line yAxisId="rate" isAnimationActive={false} type="monotone" dataKey="churnRate" name="Taxa de inatividade" stroke={colors.churn} strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0, fill: colors.churn }} activeDot={{ r: 4 }} connectNulls />
                      <Line yAxisId="count" isAnimationActive={false} dataKey="churned" name="Entraram em inatividade" stroke="transparent" dot={false} activeDot={false} legendType="none" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className={`${cardClass} p-5 sm:p-6 xl:col-span-2`} aria-label="Saúde da base">
              <PanelHeader icon={HeartPulse} title="Saúde da carteira" subtitle={`${formatInt(segmentTotal)} clientes com compra no ERP até o fim do período.`} />
              {segmentTotal === 0 ? <EmptyState icon={Users} title="Carteira vazia" text="Nenhum cliente com compra para os filtros escolhidos." /> : (
                <>
                  <div className="mb-5 flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5" aria-hidden>
                    {data.segments.map((item) => <div key={item.key} className={SEGMENTS[item.key].bar} style={{ width: `${(item.total / segmentTotal) * 100}%` }} />)}
                  </div>
                  <ul className="space-y-2">
                    {data.segments.map((item) => {
                      const meta = SEGMENTS[item.key];
                      const clickable = item.key === "risco" || item.key === "critico";
                      const content = (
                        <>
                          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${meta.tone}`}><meta.icon className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{meta.label}</span>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{formatInt(item.total)}</span>
                            </span>
                            <span className="mt-0.5 flex items-baseline justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                              <span className="truncate">{meta.text}</span>
                              <span className="shrink-0 tabular-nums">{formatPercent((item.total / segmentTotal) * 100)} · LTV {formatMoney(item.ltv)}</span>
                            </span>
                          </span>
                        </>
                      );
                      return (
                        <li key={item.key}>
                          {clickable ? (
                            <button type="button" onClick={() => { setRiskFilter(item.key as "risco" | "critico"); document.getElementById("clientes-em-risco")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent p-2 text-left transition-colors hover:border-slate-200 hover:bg-slate-50 dark:hover:border-white/10 dark:hover:bg-white/[0.03]">{content}</button>
                          ) : <div className="flex items-center gap-3 p-2">{content}</div>}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>
          </div>

          <section id="clientes-em-risco" className={`${cardClass} scroll-mt-6 p-5 sm:p-6`} aria-label="Clientes em risco">
            <PanelHeader icon={AlertTriangle} title="Clientes em risco · ação rápida" subtitle="Maiores valores históricos (LTV) entre clientes em risco de churn e insatisfeitos.">
              <div className="flex h-8 items-center rounded-lg border border-slate-200 p-0.5 text-xs dark:border-white/10" role="group" aria-label="Filtrar lista">
                {([["all", "Todos"], ["risco", "Em risco"], ["critico", "Insatisfeitos"]] as const).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setRiskFilter(key)} aria-pressed={riskFilter === key} className={`h-full cursor-pointer rounded-md px-2.5 font-medium transition-colors ${riskFilter === key ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"}`}>{label}</button>
                ))}
              </div>
            </PanelHeader>
            {riskRows.length === 0 ? <EmptyState icon={Check} title="Nenhum cliente nesta faixa" text="Não há clientes em risco ou insatisfeitos para os filtros escolhidos." /> : (
              <div className="custom-scrollbar -mx-2 overflow-x-auto">
                <div className="min-w-[860px] px-2">
                  <div className="grid grid-cols-[minmax(0,1.6fr)_8.5rem_8rem_5rem_7.5rem_4rem_15rem] items-center gap-3 border-b border-slate-100 px-3 pb-2.5 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:border-white/5 dark:text-slate-500">
                    <span>Cliente</span><span>Situação</span><span>Última compra</span><span className="text-right">Pedidos</span><span className="text-right">LTV</span><span className="text-right">Nota</span><span className="text-right">Ações</span>
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-white/5">
                    {riskRows.map((row) => {
                      const meta = SEGMENTS[row.segment];
                      const state = pipelineState[row.id];
                      return (
                        <li key={row.id} className="grid grid-cols-[minmax(0,1.6fr)_8.5rem_8rem_5rem_7.5rem_4rem_15rem] items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${meta.tone}`}>{initials(row.name)}</span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-slate-900 dark:text-white">{row.name}</span>
                              <span className="block truncate text-xs tabular-nums text-slate-500 dark:text-slate-400">{formatPhone(row.phone) || "sem telefone"}</span>
                            </span>
                          </div>
                          <span><span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${meta.badge}`}>{row.segment === "risco" ? "Em risco" : "Insatisfeito"}</span></span>
                          <span className="leading-tight">
                            <span className="block tabular-nums text-slate-700 dark:text-slate-200">{formatDay(row.last)}</span>
                            <span className="block text-[11px] text-slate-400">há {formatInt(daysSince(row.last))} dias</span>
                          </span>
                          <span className="text-right tabular-nums text-slate-700 dark:text-slate-200">{row.orders}</span>
                          <span className="text-right font-semibold tabular-nums text-slate-900 dark:text-white">{formatMoney(row.ltv)}</span>
                          <span className={`text-right tabular-nums ${row.score !== null && row.score <= 3 ? "font-semibold text-rose-600 dark:text-rose-300" : "text-slate-500 dark:text-slate-400"}`}>{row.score ?? "—"}</span>
                          <span className="flex justify-end gap-1.5">
                            <button type="button" disabled={!row.phone} onClick={() => setConversation((row.phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""))} className={`${actionButton} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20`}>
                              <MessageCircle className="h-3.5 w-3.5" />WhatsApp
                            </button>
                            <button type="button" disabled={state === "saving" || state === "added" || state === "exists"} onClick={() => void addToReactivation(row)} title="Adicionar à etapa Reativação do pipeline de relacionamento" className={`${actionButton} border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/5`}>
                              {state === "added" || state === "exists" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <RotateCcw className={`h-3.5 w-3.5 ${state === "saving" ? "animate-spin" : ""}`} />}
                              {state === "added" ? "Adicionado" : state === "exists" ? "Já no pipeline" : state === "error" ? "Tentar de novo" : "Reativação"}
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}
          </section>

          <p className="text-[11px] text-slate-400 dark:text-slate-500">Vendas do ERP atualizadas a cada importação; indicadores recalculados a cada 5 minutos. Insatisfação usa a pesquisa de 1 a 5 enviada no WhatsApp ao fim do atendimento e não filtra por vendedor.</p>
        </div>
      )}

      {conversation !== null && (
        <NewConversationDialog initialSearch={conversation} onClose={() => setConversation(null)} onOpened={(id) => { setConversation(null); router.push(`/chat?c=${id}`); }} />
      )}
    </main>
  );
}
