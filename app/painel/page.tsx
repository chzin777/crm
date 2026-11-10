"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CalendarClock, Check, HeartPulse, Inbox, Moon, Receipt, RotateCcw, ShieldAlert, Smile, Sparkles, Store, TrendingUp, UserRound, UserRoundX, Users } from "lucide-react";
import { useCrmTheme } from "@/hooks/useCrmTheme";
import { NewConversationDialog } from "@/components/chat/NewConversationDialog";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { Avatar, ChartTooltip, CompareBars, DateRange, DeltaPill, EmptyState, FadeGradient, FilterSelect, KpiCard, KpiSkeleton, Legend, LoadingBar, Pagination, PanelHeader, RefreshButton, SegmentedControl, Skel, Sparkline, TONES, cardClass, chartTheme, type Tone } from "@/components/dashboard/DashboardKit";
import type { CompareMode, CustomerDashboard, CustomerPeriodPreset, HealthSegment } from "@/lib/customer-dashboard";

type Options = { stores: { id: string; name: string }[]; sellers: string[] };
type Filters = { preset: CustomerPeriodPreset; start: string; end: string; compare: CompareMode; store: string; seller: string; inactiveDays: number };
type RiskRow = CustomerDashboard["risk"][number];

const PRESET_OPTIONS: { value: CustomerPeriodPreset; label: string; title: string }[] = [
  { value: "30d", label: "30D", title: "Últimos 30 dias" },
  { value: "month", label: "Mês", title: "Mês atual" },
  { value: "quarter", label: "Trimestre", title: "Trimestre atual" },
  { value: "custom", label: "Personalizado", title: "Escolher datas" },
];
const COMPARE_OPTIONS: { value: CompareMode; label: string; title: string }[] = [
  { value: "prev", label: "vs Anterior", title: "Comparar com o período anterior" },
  { value: "yoy", label: "YoY", title: "Comparar com o mesmo período do ano passado" },
];
const INACTIVE_OPTIONS = [30, 60, 90].map((days) => ({ value: days, label: `+${days}d`, title: `Considerar inativo após ${days} dias sem comprar` }));
const COMPARE_LABELS: Record<CompareMode, string> = { prev: "vs. período anterior", yoy: "vs. mesmo período do ano passado" };
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const SEGMENTS: Record<HealthSegment, { label: string; text: string; icon: React.ElementType; tone: Tone; bar: string }> = {
  promotor: { label: "Ativos e promotores", text: "Compraram recentemente e voltam a comprar ou avaliam bem.", icon: Sparkles, tone: "emerald", bar: "bg-gradient-to-r from-emerald-400 to-emerald-500" },
  ativo: { label: "Ativos recentes", text: "Compraram dentro do prazo, ainda sem recompra ou avaliação.", icon: TrendingUp, tone: "indigo", bar: "bg-gradient-to-r from-indigo-400 to-indigo-500" },
  risco: { label: "Em risco de churn", text: "Compravam com regularidade e pararam (até 2 anos sem comprar).", icon: AlertTriangle, tone: "amber", bar: "bg-gradient-to-r from-amber-300 to-amber-400" },
  critico: { label: "Insatisfeitos / críticos", text: "Última avaliação de atendimento com nota 1, 2 ou 3.", icon: ShieldAlert, tone: "rose", bar: "bg-gradient-to-r from-rose-300 to-rose-400" },
  dormente: { label: "Dormentes", text: "Compra única antiga ou mais de 2 anos sem comprar.", icon: Moon, tone: "slate", bar: "bg-slate-300 dark:bg-slate-600" },
};

const todayBrt = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const formatDay = (day: string) => day.split("-").reverse().join("/");
const formatInt = (value: number) => Math.round(value).toLocaleString("pt-BR");
const formatMoney = (value: number | null, digits = 0) => value === null ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits });
const formatPercent = (value: number | null) => value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]}/${month.slice(2, 4)}`;
const daysSince = (day: string) => Math.max(0, Math.round((Date.parse(todayBrt()) - Date.parse(day)) / 86_400_000));
const formatPhone = (phone: string | null) => {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone ?? "";
};

/** Etiqueta colorida por tempo sem comprar. */
function DaysTag({ days }: { days: number }) {
  const style = days > 365
    ? "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300"
    : days > 180
      ? "bg-orange-500/10 text-orange-700 ring-orange-500/20 dark:text-orange-300"
      : days > 90
        ? "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300"
        : "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300";
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset ${style}`}><CalendarClock className="h-3 w-3" />{formatInt(days)} dias</span>;
}

/** Medidor semicircular do percentual saudável da carteira. */
function HealthGauge({ value, isDark }: { value: number; isDark: boolean }) {
  const radius = 80;
  const arc = Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const color = clamped >= 60 ? (isDark ? "#34d399" : "#10b981") : clamped >= 35 ? (isDark ? "#fbbf24" : "#f59e0b") : (isDark ? "#fb7185" : "#f43f5e");
  const label = clamped >= 60 ? "Saudável" : clamped >= 35 ? "Atenção" : "Crítica";
  return (
    <div className="relative mx-auto w-full max-w-[240px]">
      <svg viewBox="0 0 200 112" className="w-full" aria-hidden>
        <defs>
          <linearGradient id="gauge-fill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity={0.55} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)"} strokeWidth={14} strokeLinecap="round" />
        <motion.path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#gauge-fill)" strokeWidth={14} strokeLinecap="round" strokeDasharray={arc} initial={{ strokeDashoffset: arc }} animate={{ strokeDashoffset: arc * (1 - clamped / 100) }} transition={{ duration: 1, ease: "easeOut" }} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="text-[32px] font-semibold leading-none tabular-nums tracking-tight text-slate-900 dark:text-white">{formatPercent(clamped)}</p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</p>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando painel">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => <KpiSkeleton key={index} />)}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className={`${cardClass} p-6 xl:col-span-2`}>
          <Skel className="h-5 w-48" />
          <Skel className="mx-auto mt-8 h-28 w-56 rounded-t-full" />
          <Skel className="mt-8 h-3 w-full rounded-full" />
          {Array.from({ length: 5 }, (_, index) => <Skel key={index} className="mt-3 h-12 w-full rounded-xl" />)}
        </div>
        <div className={`${cardClass} p-6 xl:col-span-3`}>
          <Skel className="h-5 w-56" /><Skel className="mt-2 h-3 w-72" />
          <div className="mt-8 flex h-72 items-end gap-3">
            {[45, 60, 52, 70, 64, 58, 75, 68, 80, 62, 72, 66].map((height, index) => <Skel key={index} className="flex-1 rounded-b-none rounded-t-lg" style={{ height: `${height}%` }} />)}
          </div>
        </div>
      </div>
      <div className={`${cardClass} space-y-3 p-6`}>
        <Skel className="h-5 w-56" />
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="flex items-center gap-3 rounded-xl p-3"><Skel className="h-10 w-10 rounded-full" /><Skel className="h-4 flex-1" /><Skel className="h-6 w-20 rounded-full" /><Skel className="h-8 w-24 rounded-xl" /></div>)}
      </div>
    </div>
  );
}

const RISK_PAGE_SIZE = 8;
const actionButton = "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50";

export default function PainelPage() {
  const router = useRouter();
  const { isDark } = useCrmTheme();
  const [filters, setFilters] = useState<Filters>(() => ({ preset: "30d", start: todayBrt(), end: todayBrt(), compare: "prev", store: "", seller: "", inactiveDays: 90 }));
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: CustomerDashboard; options?: Options; error?: string } | null>(null);
  const [riskFilter, setRiskFilter] = useState<"all" | "risco" | "critico">("all");
  const [riskPageState, setRiskPageState] = useState<{ key: string; page: number; dir: number }>({ key: "", page: 0, dir: 1 });
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

  const theme = chartTheme(isDark);
  const colors = {
    newBuyers: isDark ? TONES.indigo.strokeDark : TONES.indigo.stroke,
    recurring: isDark ? TONES.emerald.strokeDark : TONES.emerald.stroke,
    churn: isDark ? "#fb923c" : "#f97316",
  };
  const compareLabel = data ? (data.filters.compare === "yoy" ? "vs ano passado" : "vs anterior") : "";
  const timeline = (data?.timeline ?? []).map((item) => ({ ...item, label: monthLabel(item.month) }));
  const timelineTotal = timeline.reduce((sum, item) => sum + item.newBuyers + item.recurring + item.churned, 0);
  const buyersSeries = timeline.map((item) => item.newBuyers + item.recurring);
  const newBuyersSeries = timeline.map((item) => item.newBuyers);
  const churnSeries = timeline.map((item) => item.churnRate).filter((value): value is number => value !== null);
  const segmentTotal = (data?.segments ?? []).reduce((sum, item) => sum + item.total, 0);
  const healthyTotal = (data?.segments ?? []).filter((item) => item.key === "promotor" || item.key === "ativo").reduce((sum, item) => sum + item.total, 0);
  const riskRows = (data?.risk ?? []).filter((row) => riskFilter === "all" || row.segment === riskFilter);
  // Página volta para 1 quando muda filtro da lista ou da consulta.
  const riskPageKey = `${query}|${riskFilter}`;
  const riskPageCount = Math.max(1, Math.ceil(riskRows.length / RISK_PAGE_SIZE));
  const riskPage = riskPageState.key === riskPageKey ? Math.min(riskPageState.page, riskPageCount - 1) : 0;
  const riskPageRows = riskRows.slice(riskPage * RISK_PAGE_SIZE, (riskPage + 1) * RISK_PAGE_SIZE);
  const goToRiskPage = (page: number) => setRiskPageState({ key: riskPageKey, page: Math.max(0, Math.min(riskPageCount - 1, page)), dir: page >= riskPage ? 1 : -1 });
  const answered = data?.kpis.dissatisfaction.answered ?? 0;
  const detractors = data?.kpis.dissatisfaction.detractors ?? 0;
  const activeShare = data && data.kpis.base.total > 0 ? (data.kpis.buyers.value / data.kpis.base.total) * 100 : null;

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-12 pt-8 sm:px-8">
      <LoadingBar active={loading && !!data} />
      <header className="flex flex-col justify-between gap-5 2xl:flex-row 2xl:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-600 dark:text-[#C4D600]">Relacionamento · CRM + ERP</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white">Clientes e Relacionamento</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Base, recompra, retenção e satisfação
            {data && <span className="text-slate-400 dark:text-slate-500"> · {formatDay(data.period.startDay)} a {formatDay(data.period.endDay)} {COMPARE_LABELS[data.filters.compare]} ({formatDay(data.period.compareStart)} a {formatDay(data.period.compareEnd)})</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl label="Período" value={filters.preset} options={PRESET_OPTIONS} onChange={(preset) => setFilters((current) => ({ ...current, preset }))} />
          {filters.preset === "custom" && (
            <DateRange start={filters.start} end={filters.end} max={todayBrt()} onChange={(range) => setFilters((current) => ({ ...current, ...range }))} />
          )}
          <SegmentedControl label="Comparar com" value={filters.compare} options={COMPARE_OPTIONS} onChange={(compare) => setFilters((current) => ({ ...current, compare }))} />
          <SegmentedControl label="Considerar inativo após" value={filters.inactiveDays} options={INACTIVE_OPTIONS} onChange={(inactiveDays) => setFilters((current) => ({ ...current, inactiveDays }))} />
          <FilterSelect icon={Store} label="Loja" allLabel="Todas as lojas" value={filters.store} options={(options?.stores ?? []).map((store) => ({ value: store.id, label: store.name }))} onChange={(store) => setFilters((current) => ({ ...current, store }))} />
          <FilterSelect icon={UserRound} label="Vendedor" allLabel="Todos os vendedores" value={filters.seller} options={(options?.sellers ?? []).map((seller) => ({ value: seller, label: seller }))} onChange={(seller) => setFilters((current) => ({ ...current, seller }))} />
          <RefreshButton loading={loading} onClick={() => setReloadToken((token) => token + 1)} />
        </div>
      </header>

      {result?.error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{result.error}</p>}

      {!data && !result?.error && <DashboardSkeleton />}

      {data && (
        <div className={`space-y-6 transition-opacity duration-300 ${loading ? "pointer-events-none opacity-60" : ""}`} aria-busy={loading}>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard icon={Users} tone="indigo" label="Base de clientes" value={formatInt(data.kpis.base.total)} hint="Contatos únicos cadastrados no CRM (filtra pela loja do cadastro)." delta={<span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-indigo-700 ring-1 ring-inset ring-indigo-500/20 dark:text-indigo-300">{formatPercent(activeShare)} ativos no período</span>} meta="Primeiras compras por mês (12m)">
              {newBuyersSeries.length > 1 ? <Sparkline data={newBuyersSeries} tone="indigo" isDark={isDark} /> : null}
            </KpiCard>
            <KpiCard icon={TrendingUp} tone="emerald" label="Compraram no período" value={formatInt(data.kpis.buyers.value)} hint="Clientes distintos com pedido de venda no ERP dentro do período." delta={<DeltaPill value={data.kpis.buyers.value} previous={data.kpis.buyers.previous} suffix={compareLabel} />} meta={<><b className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatInt(data.kpis.buyers.newBuyers)}</b> primeira compra · {formatInt(data.kpis.buyers.orders)} pedidos</>}>
              {buyersSeries.length > 1 ? <Sparkline data={buyersSeries} tone="emerald" isDark={isDark} /> : <CompareBars current={data.kpis.buyers.value} previous={data.kpis.buyers.previous} tone="emerald" format={(value) => value === null ? "—" : formatInt(value)} />}
            </KpiCard>
            <KpiCard icon={UserRoundX} tone="amber" label={`Sem compra há +${data.filters.inactiveDays} dias`} value={formatInt(data.kpis.inactive.value)} hint="Clientes que já compraram e estão sem recompra no fim do período." delta={<DeltaPill value={data.kpis.inactive.value} previous={data.kpis.inactive.previous} lowerIsBetter suffix={compareLabel} />} meta={
              <span className="flex flex-wrap gap-1">
                {([["30", data.kpis.inactive.ranges.d30], ["60", data.kpis.inactive.ranges.d60], ["90", data.kpis.inactive.ranges.d90], ["365", data.kpis.inactive.ranges.d365]] as const).map(([days, total]) => (
                  <span key={days} className="rounded-md bg-slate-500/[0.07] px-1.5 py-0.5 tabular-nums dark:bg-white/5">+{days}d <b className="font-semibold text-slate-700 dark:text-slate-200">{formatInt(total)}</b></span>
                ))}
              </span>
            }>
              {churnSeries.length > 1 ? <Sparkline data={churnSeries} tone="amber" isDark={isDark} /> : <CompareBars current={data.kpis.inactive.value} previous={data.kpis.inactive.previous} tone="amber" format={(value) => value === null ? "—" : formatInt(value)} />}
            </KpiCard>
            <KpiCard icon={HeartPulse} tone="rose" label="Índice de insatisfação" value={formatPercent(data.kpis.dissatisfaction.value)} hint="Avaliações de atendimento com nota 1, 2 ou 3 sobre o total respondido no período." delta={<DeltaPill value={data.kpis.dissatisfaction.value} previous={data.kpis.dissatisfaction.previous} lowerIsBetter points suffix={compareLabel} />} meta={<><b className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatInt(data.kpis.dissatisfaction.detractors)}</b> notas baixas de {formatInt(data.kpis.dissatisfaction.answered)} avaliações</>}>
              <CompareBars current={data.kpis.dissatisfaction.value} previous={data.kpis.dissatisfaction.previous} tone="rose" format={formatPercent} />
            </KpiCard>
            <KpiCard icon={Receipt} tone="sky" label="Ticket médio por pedido" value={formatMoney(data.kpis.ticket.value)} hint="Mesma conta do BI: faturamento das notas do período (sem serviços) dividido pela quantidade de pedidos." delta={<DeltaPill value={data.kpis.ticket.value} previous={data.kpis.ticket.previous} suffix={compareLabel} />} meta={<>Faturamento <b className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatMoney(data.kpis.ticket.revenue)}</b></>}>
              <CompareBars current={data.kpis.ticket.value} previous={data.kpis.ticket.previous} tone="sky" format={(value) => formatMoney(value)} />
            </KpiCard>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <section className={`${cardClass} p-6 xl:col-span-2`} aria-label="Saúde da base">
              <PanelHeader icon={HeartPulse} tone="emerald" title="Saúde da carteira" subtitle={`${formatInt(segmentTotal)} clientes com compra no ERP até o fim do período.`} />
              {segmentTotal === 0 ? <EmptyState icon={Users} title="Carteira vazia" text="Nenhum cliente com compra para os filtros escolhidos." /> : (
                <>
                  <HealthGauge value={(healthyTotal / segmentTotal) * 100} isDark={isDark} />
                  <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">da carteira está ativa (promotores + ativos recentes)</p>

                  <div className="mt-6 space-y-3">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500"><span>Composição da carteira</span><span className="tabular-nums">{formatInt(segmentTotal)}</span></div>
                      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5" aria-hidden>
                        {data.segments.map((item) => item.total > 0 && (
                          <motion.div key={item.key} className={`${SEGMENTS[item.key].bar} first:rounded-l-full last:rounded-r-full`} initial={{ width: 0 }} animate={{ width: `${(item.total / segmentTotal) * 100}%` }} transition={{ duration: 0.7, ease: "easeOut" }} title={`${SEGMENTS[item.key].label}: ${formatInt(item.total)}`} />
                        ))}
                      </div>
                    </div>
                    {answered > 0 && (
                      <div>
                        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500"><span className="flex items-center gap-1"><Smile className="h-3 w-3" />Satisfação no período</span><span className="tabular-nums">{formatInt(answered)} avaliações</span></div>
                        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5" aria-hidden>
                          <motion.div className="rounded-l-full bg-gradient-to-r from-emerald-400 to-emerald-500" initial={{ width: 0 }} animate={{ width: `${((answered - detractors) / answered) * 100}%` }} transition={{ duration: 0.7, ease: "easeOut" }} />
                          <motion.div className="rounded-r-full bg-gradient-to-r from-rose-300 to-rose-400" initial={{ width: 0 }} animate={{ width: `${(detractors / answered) * 100}%` }} transition={{ duration: 0.7, ease: "easeOut" }} />
                        </div>
                        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Notas 4–5 · {formatPercent(((answered - detractors) / answered) * 100)}</span>
                          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-400" />Notas 1–3 · {formatPercent((detractors / answered) * 100)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <ul className="mt-5 space-y-1">
                    {data.segments.map((item) => {
                      const meta = SEGMENTS[item.key];
                      const clickable = item.key === "risco" || item.key === "critico";
                      const content = (
                        <>
                          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${TONES[meta.tone].badge}`}><meta.icon className="h-4 w-4" /></span>
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
                            <button type="button" onClick={() => { setRiskFilter(item.key as "risco" | "critico"); document.getElementById("clientes-em-risco")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent p-2.5 text-left transition-all hover:border-slate-200/80 hover:bg-slate-50/80 dark:hover:border-white/10 dark:hover:bg-white/[0.03]">{content}</button>
                          ) : <div className="flex items-center gap-3 p-2.5">{content}</div>}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>

            <section className={`${cardClass} p-6 xl:col-span-3`} aria-label="Evolução de compradores e inativos">
              <PanelHeader icon={TrendingUp} tone="indigo" title="Compradores vs. inatividade" subtitle={`Últimos 12 meses: primeira compra, recompra e clientes que passaram de ${data.filters.inactiveDays} dias sem comprar.`}>
                <Legend items={[{ label: "Novos", color: colors.newBuyers }, { label: "Recorrentes", color: colors.recurring }, { label: "Taxa de inatividade", color: colors.churn, line: true }]} />
              </PanelHeader>
              {timelineTotal === 0 ? <EmptyState icon={Inbox} title="Sem vendas no período" text="Nenhum pedido encontrado para a loja ou vendedor selecionado." /> : (
                <div className="h-[420px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={timeline} margin={{ top: 8, right: 0, left: -8, bottom: 0 }}>
                      <defs>
                        <FadeGradient id="cust-new" color={colors.newBuyers} from={0.9} to={0.35} />
                        <FadeGradient id="cust-rec" color={colors.recurring} from={0.95} to={0.55} />
                      </defs>
                      <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: theme.tick, fontSize: 11 }} dy={8} />
                      <YAxis yAxisId="count" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: theme.tick, fontSize: 11 }} width={48} tickFormatter={(value: number) => value >= 1000 ? `${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(value)} />
                      <YAxis yAxisId="rate" orientation="right" axisLine={false} tickLine={false} tick={{ fill: theme.tick, fontSize: 11 }} width={40} tickFormatter={(value: number) => `${value}%`} />
                      <Tooltip content={<ChartTooltip format={(item) => item.dataKey === "churnRate" ? formatPercent(typeof item.value === "number" ? item.value : null) : formatInt(Number(item.value ?? 0))} />} cursor={{ fill: theme.cursor, radius: 8 }} />
                      <Bar yAxisId="count" dataKey="newBuyers" name="Novos compradores" stackId="buyers" fill="url(#cust-new)" maxBarSize={36} animationDuration={600} />
                      <Bar yAxisId="count" dataKey="recurring" name="Recorrentes" stackId="buyers" fill="url(#cust-rec)" radius={[8, 8, 0, 0]} maxBarSize={36} animationDuration={600} />
                      <Line yAxisId="rate" type="monotone" dataKey="churnRate" name="Taxa de inatividade" stroke={colors.churn} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: isDark ? "#071440" : "#fff" }} connectNulls animationDuration={800} />
                      <Line yAxisId="count" isAnimationActive={false} dataKey="churned" name="Entraram em inatividade" stroke="transparent" dot={false} activeDot={false} legendType="none" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          </div>

          <section id="clientes-em-risco" className={`${cardClass} scroll-mt-6 p-6`} aria-label="Clientes em risco">
            <PanelHeader icon={AlertTriangle} tone="amber" title="Clientes em risco · ação rápida" subtitle="Maiores valores históricos (LTV) entre clientes em risco de churn e insatisfeitos.">
              <SegmentedControl label="Filtrar lista" value={riskFilter} options={[{ value: "all", label: "Todos" }, { value: "risco", label: "Em risco" }, { value: "critico", label: "Insatisfeitos" }]} onChange={setRiskFilter} />
            </PanelHeader>
            {riskRows.length === 0 ? <EmptyState icon={Check} title="Nenhum cliente nesta faixa" text="Não há clientes em risco ou insatisfeitos para os filtros escolhidos." /> : (
              <div className="custom-scrollbar -mx-2 overflow-x-auto">
                <div className="min-w-[920px] px-2">
                  <div className="grid grid-cols-[minmax(0,1.6fr)_8rem_9rem_5rem_7.5rem_4rem_16rem] items-center gap-3 px-4 pb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <span>Cliente</span><span>Situação</span><span>Última compra</span><span className="text-right">Pedidos</span><span className="text-right">LTV</span><span className="text-right">Nota</span><span className="text-right">Ações</span>
                  </div>
                  <motion.ul key={riskPage} initial={{ opacity: 0, x: riskPageState.dir * 14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, ease: "easeOut" }} className="space-y-2" style={riskPageCount > 1 ? { minHeight: RISK_PAGE_SIZE * 78 - 8 } : undefined}>
                    {riskPageRows.map((row) => {
                      const meta = SEGMENTS[row.segment];
                      const state = pipelineState[row.id];
                      return (
                        <li key={row.id} className="grid grid-cols-[minmax(0,1.6fr)_8rem_9rem_5rem_7.5rem_4rem_16rem] items-center gap-3 rounded-2xl border border-slate-200/60 bg-white/60 px-4 py-3.5 text-sm transition-all hover:-translate-y-px hover:border-slate-300/80 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.15)] dark:border-white/[0.05] dark:bg-white/[0.02] dark:hover:border-white/10">
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar name={row.name} tone={meta.tone} />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-slate-900 dark:text-white">{row.name}</span>
                              <span className="block truncate text-xs tabular-nums text-slate-500 dark:text-slate-400">{formatPhone(row.phone) || "sem telefone"}</span>
                            </span>
                          </div>
                          <span><span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${TONES[meta.tone].badge}`}><meta.icon className="h-3 w-3" />{row.segment === "risco" ? "Em risco" : "Insatisfeito"}</span></span>
                          <span className="flex flex-col items-start gap-1 leading-tight">
                            <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{formatDay(row.last)}</span>
                            <DaysTag days={daysSince(row.last)} />
                          </span>
                          <span className="text-right tabular-nums text-slate-700 dark:text-slate-200">{row.orders}</span>
                          <span className="text-right font-semibold tabular-nums text-slate-900 dark:text-white">{formatMoney(row.ltv)}</span>
                          <span className="text-right">{row.score === null ? <span className="text-slate-400">—</span> : <span className={`inline-grid h-7 w-7 place-items-center rounded-lg text-xs font-bold tabular-nums ${row.score <= 3 ? "bg-rose-500/10 text-rose-600 dark:text-rose-300" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"}`}>{row.score}</span>}</span>
                          <span className="flex justify-end gap-2">
                            <button type="button" disabled={!row.phone} onClick={() => setConversation((row.phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""))} className={`${actionButton} bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:from-emerald-400 hover:to-emerald-600 hover:shadow-md hover:shadow-emerald-600/25`}>
                              <WhatsAppIcon className="h-4 w-4" />WhatsApp
                            </button>
                            <button type="button" disabled={state === "saving" || state === "added" || state === "exists"} onClick={() => void addToReactivation(row)} title="Adicionar à etapa Reativação do pipeline de relacionamento" className={`${actionButton} border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200 dark:hover:bg-white/[0.06]`}>
                              {state === "added" || state === "exists" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <RotateCcw className={`h-3.5 w-3.5 ${state === "saving" ? "animate-spin" : ""}`} />}
                              {state === "added" ? "Adicionado" : state === "exists" ? "Já no pipeline" : state === "error" ? "Tentar de novo" : "Reativação"}
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </motion.ul>
                </div>
              </div>
            )}
            {riskRows.length > 0 && (
              <Pagination page={riskPage} pageSize={RISK_PAGE_SIZE} total={riskRows.length} noun={riskFilter === "critico" ? "clientes insatisfeitos" : riskFilter === "risco" ? "clientes em risco" : "clientes em risco ou insatisfeitos"} onChange={goToRiskPage} />
            )}
          </section>

          <p className="text-[11px] text-slate-400 dark:text-slate-500">Vendas do ERP sincronizadas a cada minuto (itens de serviço não entram no faturamento); indicadores recalculados a cada minuto. Insatisfação usa a pesquisa de 1 a 5 enviada no WhatsApp ao fim do atendimento e não filtra por vendedor.</p>
        </div>
      )}

      {conversation !== null && (
        <NewConversationDialog initialSearch={conversation} onClose={() => setConversation(null)} onOpened={(id) => { setConversation(null); router.push(`/chat?c=${id}`); }} />
      )}
    </main>
  );
}
