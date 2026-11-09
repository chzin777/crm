"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, CalendarDays, Clock, Headphones, Hourglass, Inbox, ListFilter, MapPin, MessageCircleReply, MessagesSquare, RefreshCw, Star, Tags, UserRound, Users } from "lucide-react";
import { useCrmTheme } from "@/hooks/useCrmTheme";
import type { PeriodPreset, ServiceMetrics } from "@/lib/service-metrics";

type Options = { queues: { id: string; name: string }[]; operators: { id: string; name: string }[] };
type Filters = { preset: PeriodPreset; start: string; end: string; queueId: string; assigneeId: string };
type SortKey = "name" | "closed" | "tma" | "tmr" | "nps";
type RankingRow = ServiceMetrics["ranking"][number];

const PRESET_LABELS: Record<PeriodPreset, string> = { today: "Hoje", "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", month: "Mês atual", custom: "Personalizado" };

const todayBrt = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Segundos em texto curto: 45s, 12 min, 1h 05min. */
function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const value = Math.max(0, Math.round(seconds));
  if (value < 60) return `${value}s`;
  const minutes = Math.round(value / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, "0")}min`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

const formatDay = (day: string) => day.split("-").reverse().join("/");

/** Variação percentual contra o período anterior; lowerIsBetter para tempos. */
function Delta({ value, previous, lowerIsBetter = false }: { value: number | null; previous: number | null; lowerIsBetter?: boolean }) {
  if (value === null || previous === null || previous === 0) return <span className="text-[11px] text-slate-400 dark:text-slate-500">sem comparação</span>;
  const change = ((value - previous) / previous) * 100;
  if (Math.abs(change) < 0.5) return <span className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-white/5 dark:text-slate-400">= anterior</span>;
  const good = lowerIsBetter ? change < 0 : change > 0;
  const Icon = change > 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${good ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"}`}>
      <Icon className="h-3 w-3" />{Math.abs(change).toFixed(0)}%
    </span>
  );
}

const cardClass = "rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/[0.06] dark:bg-[#0a1b4d]";

function KpiCard({ icon: Icon, label, hint, value, tone, children }: { icon: React.ElementType; label: string; hint: string; value: string; tone: string; children?: React.ReactNode }) {
  return (
    <section className={`${cardClass} flex flex-col p-5`} aria-label={label} title={hint}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-2 text-[28px] font-semibold leading-none tabular-nums tracking-tight text-slate-900 dark:text-white">{value}</p>
      <div className="mt-3 flex flex-1 flex-col justify-end gap-1.5">{children}</div>
    </section>
  );
}

function SlaBadge({ seconds, warn, breach }: { seconds: number | null; warn: number; breach: number }) {
  if (seconds === null) return <span className="text-[11px] text-slate-400">—</span>;
  const [label, style, dot] = seconds > breach
    ? ["Fora do SLA", "bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20", "bg-rose-500"]
    : seconds > warn
      ? ["Atenção", "bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20", "bg-amber-500"]
      : ["No SLA", "bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20", "bg-emerald-500"];
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${style}`}><span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{label}</span>;
}

function SortButton({ label, column, align, sort, onSort }: { label: string; column: SortKey; align: "left" | "right"; sort: { key: SortKey; dir: "asc" | "desc" }; onSort: (key: SortKey) => void }) {
  const active = sort.key === column;
  return (
    <button type="button" onClick={() => onSort(column)} aria-label={`Ordenar por ${label}`} className={`inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-slate-900 dark:hover:text-white ${align === "right" ? "justify-end" : ""} ${active ? "text-slate-900 dark:text-white" : ""}`}>
      {label}
      {active ? (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
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
    <div className="space-y-5" aria-busy="true" aria-label="Carregando métricas">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className={`${cardClass} p-5`}>
            <div className="flex justify-between"><Skel className="h-4 w-24" /><Skel className="h-8 w-8 rounded-lg" /></div>
            <Skel className="mt-3 h-7 w-20" />
            <Skel className="mt-4 h-4 w-16 rounded-full" />
          </div>
        ))}
      </div>
      <div className={`${cardClass} p-5 sm:p-6`}>
        <Skel className="h-5 w-48" /><Skel className="mt-2 h-3 w-64" />
        <div className="mt-6 flex h-56 items-end gap-2">
          {[40, 65, 50, 80, 55, 70, 45, 85, 60, 75, 50, 66].map((height, index) => <Skel key={index} className="flex-1 rounded-b-none rounded-t-md" style={{ height: `${height}%` }} />)}
        </div>
      </div>
      <div className={`${cardClass} space-y-3 p-5 sm:p-6`}>
        <Skel className="h-5 w-56" />
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="flex items-center gap-3"><Skel className="h-9 w-9 rounded-full" /><Skel className="h-4 flex-1" /></div>)}
      </div>
    </div>
  );
}

type ChartTooltipProps = { active?: boolean; label?: string | number; payload?: { name?: string; value?: number | string; color?: string }[] };

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[150px] rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 text-xs shadow-lg backdrop-blur dark:border-white/10 dark:bg-[#0d2160]/95">
      <p className="mb-1.5 font-semibold text-slate-900 dark:text-white">{label}</p>
      {payload.map((item) => (
        <div key={item.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>
          <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
const AVATAR_TONES = [
  "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
];

const selectWrap = "flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 transition-colors hover:border-slate-300 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/15 dark:border-white/10 dark:bg-[#0a1b4d] dark:text-slate-200 dark:hover:border-white/20";
const selectInner = "min-w-0 max-w-[180px] cursor-pointer truncate bg-transparent outline-none dark:[color-scheme:dark]";

export default function ServiceMetricsPage() {
  const { isDark } = useCrmTheme();
  const [filters, setFilters] = useState<Filters>(() => ({ preset: "7d", start: todayBrt(), end: todayBrt(), queueId: "", assigneeId: "" }));
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: ServiceMetrics; options?: Options; error?: string } | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "closed", dir: "desc" });

  const query = useMemo(() => {
    const params = new URLSearchParams({ preset: filters.preset });
    if (filters.preset === "custom") { params.set("start", filters.start); params.set("end", filters.end); }
    if (filters.queueId) params.set("queueId", filters.queueId);
    if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
    return params.toString();
  }, [filters]);
  const requestKey = `${query}#${reloadToken}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/metrics/service?${query}`, { signal: controller.signal, cache: reloadToken ? "no-store" : "default" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { data?: ServiceMetrics; options?: Options; error?: string } | null;
        if (!response.ok || !body?.data) throw new Error(body?.error ?? "Não foi possível carregar as métricas.");
        setResult({ key: requestKey, data: body.data, options: body.options });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult((current) => ({ ...current, key: requestKey, error: error instanceof Error ? error.message : "Não foi possível carregar as métricas." }));
      });
    return () => controller.abort();
  }, [query, reloadToken, requestKey]);

  const loading = result?.key !== requestKey;
  const data = result?.data;
  const options = result?.options;

  const ranking = useMemo(() => {
    const rows = [...(data?.ranking ?? [])];
    const value = (row: RankingRow) => (sort.key === "name" ? row.name : row[sort.key]);
    rows.sort((a, b) => {
      const left = value(a), right = value(b);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      const compare = typeof left === "string" ? left.localeCompare(String(right)) : left - Number(right);
      return sort.dir === "asc" ? compare : -compare;
    });
    return rows;
  }, [data, sort]);

  const toggleSort = (key: SortKey) => setSort((current) => ({ key, dir: current.key === key && current.dir === "desc" ? "asc" : "desc" }));

  const colors = { started: isDark ? "#818cf8" : "#4f46e5", closed: isDark ? "#34d399" : "#10b981", grid: isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.06)", tick: isDark ? "#64748b" : "#94a3b8" };
  const timeline = (data?.timeline ?? []).map((item) => ({ ...item, label: `${item.day.slice(8, 10)}/${item.day.slice(5, 7)}` }));
  const timelineTotal = timeline.reduce((sum, item) => sum + item.started + item.closed, 0);
  const maxWord = Math.max(1, ...(data?.words ?? []).map((item) => item.total));
  const maxState = Math.max(1, ...(data?.regions.states ?? []).map((item) => item.total));
  const regionTotal = (data?.regions.states ?? []).reduce((sum, item) => sum + item.total, 0);
  const npsMax = Math.max(1, ...(data?.kpis.nps.distribution ?? []).map((item) => item.total));
  const maxClosed = Math.max(1, ...ranking.map((row) => row.closed));

  const sortButton = (label: string, column: SortKey, align: "left" | "right" = "right") => (
    <SortButton label={label} column={column} align={align} sort={sort} onSort={toggleSort} />
  );

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-12 pt-8 sm:px-8">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Métricas de Atendimento</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tempos, volume, satisfação e desempenho da equipe no WhatsApp
            {data && <span className="text-slate-400 dark:text-slate-500"> · {formatDay(data.period.startDay)} a {formatDay(data.period.endDay)}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={selectWrap}>
            <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="sr-only">Período</span>
            <select value={filters.preset} onChange={(event) => setFilters((current) => ({ ...current, preset: event.target.value as PeriodPreset }))} className={selectInner}>
              {(Object.keys(PRESET_LABELS) as PeriodPreset[]).map((preset) => <option key={preset} value={preset}>{PRESET_LABELS[preset]}</option>)}
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
            <ListFilter className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="sr-only">Fila</span>
            <select value={filters.queueId} onChange={(event) => setFilters((current) => ({ ...current, queueId: event.target.value }))} className={selectInner}>
              <option value="">Todas as filas</option>
              {options?.queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
            </select>
          </label>
          <label className={selectWrap}>
            <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="sr-only">Atendente</span>
            <select value={filters.assigneeId} onChange={(event) => setFilters((current) => ({ ...current, assigneeId: event.target.value }))} className={selectInner}>
              <option value="">Todos os atendentes</option>
              {options?.operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.name}</option>)}
            </select>
          </label>
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
            <KpiCard icon={Hourglass} tone="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300" label="TME · Espera" value={formatDuration(data.kpis.tme.value)} hint="Da primeira mensagem do cliente até a primeira resposta de um atendente.">
              <div className="flex items-center gap-2"><Delta value={data.kpis.tme.value} previous={data.kpis.tme.previous} lowerIsBetter /><span className="text-[11px] text-slate-400 dark:text-slate-500">até 1ª resposta</span></div>
            </KpiCard>
            <KpiCard icon={Headphones} tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300" label="TMA · Atendimento" value={formatDuration(data.kpis.tma.value)} hint="Da primeira resposta do atendente até o encerramento.">
              <div className="flex items-center gap-2"><Delta value={data.kpis.tma.value} previous={data.kpis.tma.previous} lowerIsBetter /><span className="text-[11px] text-slate-400 dark:text-slate-500">até encerrar</span></div>
            </KpiCard>
            <KpiCard icon={MessageCircleReply} tone="bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300" label="TMR · Resposta" value={formatDuration(data.kpis.tmr.value)} hint="Tempo para responder cada mensagem do cliente.">
              <div className="flex items-center gap-2"><Delta value={data.kpis.tmr.value} previous={data.kpis.tmr.previous} lowerIsBetter /><span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">{data.kpis.tmr.samples} respostas</span></div>
            </KpiCard>
            <KpiCard icon={MessagesSquare} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300" label="Volume" value={String(data.kpis.volume.started)} hint="Atendimentos iniciados e encerrados no período.">
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400"><span>Iniciados</span><Delta value={data.kpis.volume.started} previous={data.kpis.volume.prevStarted} /></div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400"><span><b className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{data.kpis.volume.closed}</b> encerrados</span><Delta value={data.kpis.volume.closed} previous={data.kpis.volume.prevClosed} /></div>
            </KpiCard>
            <KpiCard icon={Star} tone="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300" label="NPS · Satisfação" value={data.kpis.nps.value === null ? "—" : `${data.kpis.nps.value.toFixed(1)}`} hint={`${data.kpis.nps.total} avaliação(ões) respondida(s), notas de 1 a 5.`}>
              <div className="flex items-center gap-2"><Delta value={data.kpis.nps.value} previous={data.kpis.nps.previous} /><span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">{data.kpis.nps.total} avaliações</span></div>
              <div className="flex h-8 items-end gap-1" aria-label="Distribuição das notas">
                {data.kpis.nps.distribution.map((item) => (
                  <div key={item.score} className="flex flex-1 flex-col items-center gap-0.5" title={`Nota ${item.score}: ${item.total}`}>
                    <div className={`w-full rounded-sm ${item.score >= 4 ? "bg-emerald-400/80" : item.score === 3 ? "bg-amber-300/90" : "bg-rose-300/90"}`} style={{ height: `${Math.max(2, (item.total / npsMax) * 20)}px` }} />
                    <span className="text-[9px] font-medium text-slate-400">{item.score}</span>
                  </div>
                ))}
              </div>
            </KpiCard>
          </div>

          <section className={`${cardClass} p-5 sm:p-6`} aria-label="Atendimentos por dia">
            <PanelHeader icon={BarChart3} title="Atendimentos por dia" subtitle="Iniciados e encerrados em cada dia do período.">
              <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.started }} />Iniciados</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.closed }} />Encerrados</span>
              </div>
            </PanelHeader>
            {timelineTotal === 0 ? <EmptyState icon={Inbox} title="Nenhum atendimento no período" text="Ajuste o período ou os filtros de fila e atendente para ver os dados." /> : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeline} margin={{ top: 4, right: 4, left: -12, bottom: 0 }} barGap={3}>
                    <CartesianGrid stroke={colors.grid} vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: colors.tick, fontSize: 11 }} dy={8} minTickGap={16} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: colors.tick, fontSize: 11 }} width={40} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)", radius: 6 }} />
                    <Bar isAnimationActive={false} dataKey="started" name="Iniciados" fill={colors.started} radius={[5, 5, 0, 0]} maxBarSize={22} />
                    <Bar isAnimationActive={false} dataKey="closed" name="Encerrados" fill={colors.closed} radius={[5, 5, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className={`${cardClass} p-5 sm:p-6`} aria-label="Ranking de atendentes">
            <PanelHeader icon={Users} title="Desempenho dos atendentes" subtitle={`SLA de resposta: até ${formatDuration(data.sla.warn)} ok · até ${formatDuration(data.sla.breach)} atenção · acima disso fora do SLA.`} />
            {ranking.length === 0 ? <EmptyState icon={Users} title="Sem atendimentos humanos" text="Nenhum atendente encerrou ou respondeu conversas com os filtros escolhidos." /> : (
              <div className="custom-scrollbar -mx-2 overflow-x-auto">
                <div className="min-w-[720px] px-2">
                  <div className="grid grid-cols-[2rem_minmax(0,1fr)_7rem_6rem_7rem_6rem_7rem] items-center gap-3 border-b border-slate-100 px-3 pb-2.5 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:border-white/5 dark:text-slate-500">
                    <span>#</span>
                    {sortButton("Atendente", "name", "left")}
                    {sortButton("Encerrados", "closed")}
                    {sortButton("TMA", "tma")}
                    {sortButton("TMR", "tmr")}
                    {sortButton("NPS", "nps")}
                    <span className="text-right">SLA</span>
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-white/5">
                    {ranking.map((row, index) => (
                      <li key={row.userId} className="grid grid-cols-[2rem_minmax(0,1fr)_7rem_6rem_7rem_6rem_7rem] items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                        <span className="text-xs font-medium tabular-nums text-slate-400">{index + 1}</span>
                        <div className="flex min-w-0 items-center gap-3">
                          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${AVATAR_TONES[index % AVATAR_TONES.length]}`}>{initials(row.name)}</span>
                          <span className="truncate font-medium text-slate-900 dark:text-white">{row.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold tabular-nums text-slate-900 dark:text-white">{row.closed}</p>
                          <div className="ml-auto mt-1 h-1 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5"><div className="h-full rounded-full bg-indigo-400 dark:bg-indigo-400/80" style={{ width: `${(row.closed / maxClosed) * 100}%` }} /></div>
                        </div>
                        <span className="text-right tabular-nums text-slate-700 dark:text-slate-200">{formatDuration(row.tma)}</span>
                        <span className="text-right tabular-nums text-slate-700 dark:text-slate-200">{formatDuration(row.tmr)}{row.responses > 0 && <span className="ml-1 text-[10px] text-slate-400">({row.responses})</span>}</span>
                        <span className="text-right tabular-nums text-slate-700 dark:text-slate-200">{row.nps === null ? "—" : <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{row.nps.toFixed(1)}</span>}{row.npsCount > 0 && <span className="ml-1 text-[10px] text-slate-400">({row.npsCount})</span>}</span>
                        <span className="text-right"><SlaBadge seconds={row.tmr} warn={data.sla.warn} breach={data.sla.breach} /></span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section className={`${cardClass} p-5 sm:p-6`} aria-label="Termos mais frequentes">
              <PanelHeader icon={Tags} title="Termos mais frequentes" subtitle="Palavras mais usadas pelos clientes, sem palavras comuns." />
              {data.words.length === 0 ? <EmptyState icon={Tags} title="Sem mensagens de clientes" text="Nenhuma mensagem recebida no período selecionado." /> : (
                <div className="flex flex-wrap gap-2">
                  {data.words.map((item) => {
                    const weight = item.total / maxWord;
                    const tone = weight > 0.66
                      ? "bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500"
                      : weight > 0.33
                        ? "bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-200 dark:border-indigo-500/20"
                        : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-white/[0.03] dark:text-slate-300 dark:border-white/10";
                    return (
                      <span key={item.word} title={`${item.word}: ${item.total} vez(es)`} className={`inline-flex cursor-default items-center gap-1.5 rounded-full border px-3 py-1 font-medium transition-transform hover:-translate-y-px ${tone}`} style={{ fontSize: `${0.75 + weight * 0.25}rem` }}>
                        {item.word}
                        <span className={`text-[10px] tabular-nums ${weight > 0.66 ? "text-white/70" : "text-slate-400 dark:text-slate-500"}`}>{item.total}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </section>

            <section className={`${cardClass} p-5 sm:p-6`} aria-label="Atendimentos por região">
              <PanelHeader icon={MapPin} title="Distribuição por região" subtitle="Estado e DDD do telefone de quem iniciou atendimento." />
              {regionTotal === 0 ? <EmptyState icon={MapPin} title="Sem DDD identificado" text="Nenhum atendimento com telefone brasileiro reconhecido no período." /> : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div>
                    <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Por estado</p>
                    <ul className="space-y-2.5">
                      {data.regions.states.slice(0, 8).map((item) => (
                        <li key={item.uf} title={`${item.uf}: ${item.total} atendimento(s)`}>
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{item.uf}</span>
                            <span className="tabular-nums text-slate-500 dark:text-slate-400"><b className="font-semibold text-slate-900 dark:text-white">{item.total}</b> · {Math.round((item.total / regionTotal) * 100)}%</span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400" style={{ width: `${(item.total / maxState) * 100}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Principais DDDs</p>
                    <ul className="space-y-2.5">
                      {data.regions.ddds.slice(0, 8).map((item) => (
                        <li key={item.ddd}>
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 dark:bg-white/5 dark:text-slate-300">{item.ddd}</span>
                              <span className="truncate text-slate-600 dark:text-slate-300">{item.city || item.uf}/{item.uf}</span>
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-white">{item.total}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${(item.total / (data.regions.ddds[0]?.total || 1)) * 100}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500"><Clock className="h-3 w-3" />Dados atualizados a cada minuto. Conversas que só guardam envios de campanha sem resposta não entram nas contas.</p>
        </div>
      )}
    </main>
  );
}
