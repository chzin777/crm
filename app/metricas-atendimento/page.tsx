"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Clock, Headphones, Hourglass, Inbox, ListFilter, MapPin, MessageCircleReply, MessagesSquare, Star, Tags, UserRound, Users } from "lucide-react";
import { useCrmTheme } from "@/hooks/useCrmTheme";
import { Avatar, ChartTooltip, CompareBars, DateRange, DeltaPill, EmptyState, FadeGradient, FilterSelect, KpiCard, KpiSkeleton, Legend, LoadingBar, PanelHeader, RefreshButton, SegmentedControl, Skel, Sparkline, TONES, cardClass, chartTheme, type Tone } from "@/components/dashboard/DashboardKit";
import type { PeriodPreset, ServiceMetrics } from "@/lib/service-metrics";
import { brDay } from "@/lib/br-time";

type Options = { queues: { id: string; name: string }[]; operators: { id: string; name: string }[] };
type Filters = { preset: PeriodPreset; start: string; end: string; queueId: string; assigneeId: string };
type SortKey = "name" | "closed" | "tma" | "tmr" | "nps";
type RankingRow = ServiceMetrics["ranking"][number];

const PRESET_OPTIONS: { value: PeriodPreset; label: string; title: string }[] = [
  { value: "today", label: "Hoje", title: "Hoje" },
  { value: "7d", label: "7D", title: "Últimos 7 dias" },
  { value: "30d", label: "30D", title: "Últimos 30 dias" },
  { value: "month", label: "Mês", title: "Mês atual" },
  { value: "custom", label: "Personalizado", title: "Escolher datas" },
];

const todayBrt = () => brDay();

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

function SlaBadge({ seconds, warn, breach }: { seconds: number | null; warn: number; breach: number }) {
  if (seconds === null) return <span className="text-[11px] text-slate-400">—</span>;
  const [label, style, dot] = seconds > breach
    ? ["Fora do SLA", "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300", "bg-rose-500"]
    : seconds > warn
      ? ["Atenção", "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300", "bg-amber-500"]
      : ["No SLA", "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300", "bg-emerald-500"];
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${style}`}><span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{label}</span>;
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

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando métricas">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => <KpiSkeleton key={index} />)}
      </div>
      <div className={`${cardClass} p-6`}>
        <div className="flex items-center gap-3"><Skel className="h-8 w-8 rounded-xl" /><div className="space-y-2"><Skel className="h-4 w-48" /><Skel className="h-3 w-64" /></div></div>
        <div className="mt-8 flex h-64 items-end gap-2">
          {[40, 65, 50, 80, 55, 70, 45, 85, 60, 75, 50, 66, 58, 72].map((height, index) => <Skel key={index} className="flex-1 rounded-b-none rounded-t-lg" style={{ height: `${height}%` }} />)}
        </div>
      </div>
      <div className={`${cardClass} space-y-4 p-6`}>
        <Skel className="h-5 w-56" />
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="flex items-center gap-3"><Skel className="h-10 w-10 rounded-full" /><Skel className="h-4 flex-1" /><Skel className="h-6 w-20 rounded-full" /></div>)}
      </div>
    </div>
  );
}

const AVATAR_TONES: Tone[] = ["indigo", "emerald", "sky", "violet", "amber"];

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

  const theme = chartTheme(isDark);
  const colors = { started: isDark ? TONES.indigo.strokeDark : TONES.indigo.stroke, closed: isDark ? TONES.emerald.strokeDark : TONES.emerald.stroke };
  const timeline = (data?.timeline ?? []).map((item) => ({ ...item, label: `${item.day.slice(8, 10)}/${item.day.slice(5, 7)}` }));
  const timelineTotal = timeline.reduce((sum, item) => sum + item.started + item.closed, 0);
  const startedSeries = timeline.map((item) => item.started);
  const closedSeries = timeline.map((item) => item.closed);
  const maxWord = Math.max(1, ...(data?.words ?? []).map((item) => item.total));
  const maxState = Math.max(1, ...(data?.regions.states ?? []).map((item) => item.total));
  const regionTotal = (data?.regions.states ?? []).reduce((sum, item) => sum + item.total, 0);
  const npsMax = Math.max(1, ...(data?.kpis.nps.distribution ?? []).map((item) => item.total));
  const maxClosed = Math.max(1, ...ranking.map((row) => row.closed));
  const npsTone: Tone = data?.kpis.nps.value == null ? "slate" : data.kpis.nps.value >= 4 ? "emerald" : data.kpis.nps.value >= 3 ? "amber" : "rose";

  const sortButton = (label: string, column: SortKey, align: "left" | "right" = "right") => (
    <SortButton label={label} column={column} align={align} sort={sort} onSort={toggleSort} />
  );

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-12 pt-8 sm:px-8">
      <LoadingBar active={loading && !!data} />
      <header className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-600 dark:text-[#C4D600]">Atendimento · WhatsApp</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white">Métricas de Atendimento</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tempos, volume, satisfação e desempenho da equipe
            {data && <span className="text-slate-400 dark:text-slate-500"> · {formatDay(data.period.startDay)} a {formatDay(data.period.endDay)}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl label="Período" value={filters.preset} options={PRESET_OPTIONS} onChange={(preset) => setFilters((current) => ({ ...current, preset }))} />
          {filters.preset === "custom" && (
            <DateRange start={filters.start} end={filters.end} max={todayBrt()} onChange={(range) => setFilters((current) => ({ ...current, ...range }))} />
          )}
          <FilterSelect icon={ListFilter} label="Fila" allLabel="Todas as filas" value={filters.queueId} options={(options?.queues ?? []).map((queue) => ({ value: queue.id, label: queue.name }))} onChange={(queueId) => setFilters((current) => ({ ...current, queueId }))} />
          <FilterSelect icon={UserRound} label="Atendente" allLabel="Todos os atendentes" value={filters.assigneeId} options={(options?.operators ?? []).map((operator) => ({ value: operator.id, label: operator.name }))} onChange={(assigneeId) => setFilters((current) => ({ ...current, assigneeId }))} />
          <RefreshButton loading={loading} onClick={() => setReloadToken((token) => token + 1)} />
        </div>
      </header>

      {result?.error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{result.error}</p>}

      {!data && !result?.error && <DashboardSkeleton />}

      {data && (
        <div className={`space-y-6 transition-opacity duration-300 ${loading ? "pointer-events-none opacity-60" : ""}`} aria-busy={loading}>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard icon={Hourglass} tone="sky" label="TME · Espera" value={formatDuration(data.kpis.tme.value)} hint="Da primeira mensagem do cliente até a primeira resposta de um atendente." delta={<DeltaPill value={data.kpis.tme.value} previous={data.kpis.tme.previous} lowerIsBetter suffix="vs anterior" />} meta="Até a 1ª resposta">
              <CompareBars current={data.kpis.tme.value} previous={data.kpis.tme.previous} tone="sky" format={formatDuration} />
            </KpiCard>
            <KpiCard icon={Headphones} tone="indigo" label="TMA · Atendimento" value={formatDuration(data.kpis.tma.value)} hint="Da primeira resposta do atendente até o encerramento." delta={<DeltaPill value={data.kpis.tma.value} previous={data.kpis.tma.previous} lowerIsBetter suffix="vs anterior" />} meta="Até encerrar">
              <CompareBars current={data.kpis.tma.value} previous={data.kpis.tma.previous} tone="indigo" format={formatDuration} />
            </KpiCard>
            <KpiCard icon={MessageCircleReply} tone="violet" label="TMR · Resposta" value={formatDuration(data.kpis.tmr.value)} hint="Tempo para responder cada mensagem do cliente." delta={<DeltaPill value={data.kpis.tmr.value} previous={data.kpis.tmr.previous} lowerIsBetter suffix="vs anterior" />} meta={<><b className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{data.kpis.tmr.samples}</b> respostas medidas</>}>
              <CompareBars current={data.kpis.tmr.value} previous={data.kpis.tmr.previous} tone="violet" format={formatDuration} />
            </KpiCard>
            <KpiCard icon={MessagesSquare} tone="emerald" label="Volume" value={String(data.kpis.volume.started)} hint="Atendimentos iniciados e encerrados no período." delta={<DeltaPill value={data.kpis.volume.started} previous={data.kpis.volume.prevStarted} suffix="iniciados" />} meta={<span className="inline-flex flex-wrap items-center gap-1.5"><b className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{data.kpis.volume.closed}</b> encerrados <DeltaPill value={data.kpis.volume.closed} previous={data.kpis.volume.prevClosed} /></span>}>
              {startedSeries.length > 1 ? <Sparkline data={startedSeries} tone="emerald" isDark={isDark} /> : <CompareBars current={data.kpis.volume.started} previous={data.kpis.volume.prevStarted} tone="emerald" format={(value) => String(value ?? "—")} />}
            </KpiCard>
            <KpiCard icon={Star} tone={npsTone} label="NPS · Satisfação" value={data.kpis.nps.value === null ? "—" : data.kpis.nps.value.toFixed(1)} hint={`${data.kpis.nps.total} avaliação(ões) respondida(s), notas de 1 a 5.`} delta={<DeltaPill value={data.kpis.nps.value} previous={data.kpis.nps.previous} suffix="vs anterior" />} meta={<><b className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{data.kpis.nps.total}</b> avaliações</>}>
              <div className="flex h-11 items-end gap-1.5" aria-label="Distribuição das notas">
                {data.kpis.nps.distribution.map((item) => (
                  <div key={item.score} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`Nota ${item.score}: ${item.total}`}>
                    <div className={`w-full rounded-md bg-gradient-to-t ${item.score >= 4 ? "from-emerald-500/40 to-emerald-500" : item.score === 3 ? "from-amber-400/40 to-amber-400" : "from-rose-400/40 to-rose-400"}`} style={{ height: `${Math.max(3, (item.total / npsMax) * 28)}px` }} />
                    <span className="text-[9px] font-semibold text-slate-400">{item.score}</span>
                  </div>
                ))}
              </div>
            </KpiCard>
          </div>

          <section className={`${cardClass} p-6`} aria-label="Atendimentos por dia">
            <PanelHeader icon={BarChart3} tone="indigo" title="Atendimentos por dia" subtitle="Iniciados (barras) e encerrados (linha) em cada dia do período.">
              <Legend items={[{ label: "Iniciados", color: colors.started }, { label: "Encerrados", color: colors.closed, line: true }]} />
            </PanelHeader>
            {timelineTotal === 0 ? <EmptyState icon={Inbox} title="Nenhum atendimento no período" text="Ajuste o período ou os filtros de fila e atendente para ver os dados." /> : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={timeline} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <FadeGradient id="svc-started" color={colors.started} from={0.9} to={0.15} />
                    </defs>
                    <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: theme.tick, fontSize: 11 }} dy={8} minTickGap={16} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: theme.tick, fontSize: 11 }} width={40} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.cursor, radius: 8 }} />
                    <Bar dataKey="started" name="Iniciados" fill="url(#svc-started)" radius={[8, 8, 0, 0]} maxBarSize={28} animationDuration={600} />
                    <Line type="monotone" dataKey="closed" name="Encerrados" stroke={colors.closed} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: isDark ? "#071440" : "#fff" }} animationDuration={800} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            {timelineTotal > 0 && (
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 sm:grid-cols-4 dark:border-white/5">
                {[
                  ["Pico de iniciados", Math.max(...startedSeries)],
                  ["Média diária", Math.round(startedSeries.reduce((sum, value) => sum + value, 0) / Math.max(1, startedSeries.length))],
                  ["Pico de encerrados", Math.max(...closedSeries)],
                  ["Dias com atendimento", startedSeries.filter((value) => value > 0).length],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-slate-50/80 px-4 py-3 dark:bg-white/[0.03]">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={`${cardClass} p-6`} aria-label="Ranking de atendentes">
            <PanelHeader icon={Users} tone="violet" title="Desempenho dos atendentes" subtitle={`SLA de resposta: até ${formatDuration(data.sla.warn)} ok · até ${formatDuration(data.sla.breach)} atenção · acima disso fora do SLA.`} />
            {ranking.length === 0 ? <EmptyState icon={Users} title="Sem atendimentos humanos" text="Nenhum atendente encerrou ou respondeu conversas com os filtros escolhidos." /> : (
              <div className="custom-scrollbar -mx-2 overflow-x-auto">
                <div className="min-w-[760px] px-2">
                  <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_8rem_6rem_7rem_6rem_7.5rem] items-center gap-3 px-4 pb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <span>#</span>
                    {sortButton("Atendente", "name", "left")}
                    {sortButton("Encerrados", "closed")}
                    {sortButton("TMA", "tma")}
                    {sortButton("TMR", "tmr")}
                    {sortButton("NPS", "nps")}
                    <span className="text-right">SLA</span>
                  </div>
                  <ul className="space-y-1.5">
                    {ranking.map((row, index) => (
                      <li key={row.userId} className="grid grid-cols-[2.5rem_minmax(0,1fr)_8rem_6rem_7rem_6rem_7.5rem] items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-sm transition-all hover:border-slate-200/80 hover:bg-slate-50/80 dark:hover:border-white/[0.06] dark:hover:bg-white/[0.03]">
                        <span className={`grid h-6 w-6 place-items-center rounded-lg text-[11px] font-bold tabular-nums ${index === 0 ? "bg-amber-400/15 text-amber-600 dark:text-amber-300" : index === 1 ? "bg-slate-400/15 text-slate-500 dark:text-slate-300" : index === 2 ? "bg-orange-400/15 text-orange-600 dark:text-orange-300" : "text-slate-400"}`}>{index + 1}</span>
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={row.name} tone={AVATAR_TONES[index % AVATAR_TONES.length]} />
                          <span className="truncate font-medium text-slate-900 dark:text-white">{row.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold tabular-nums text-slate-900 dark:text-white">{row.closed}</p>
                          <div className="ml-auto mt-1.5 h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 dark:from-indigo-400/70 dark:to-indigo-300" style={{ width: `${(row.closed / maxClosed) * 100}%` }} /></div>
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
            <section className={`${cardClass} p-6`} aria-label="Termos mais frequentes">
              <PanelHeader icon={Tags} tone="sky" title="Termos mais frequentes" subtitle="Palavras mais usadas pelos clientes, sem palavras comuns." />
              {data.words.length === 0 ? <EmptyState icon={Tags} title="Sem mensagens de clientes" text="Nenhuma mensagem recebida no período selecionado." /> : (
                <div className="flex flex-wrap gap-2">
                  {data.words.map((item) => {
                    const weight = item.total / maxWord;
                    const tone = weight > 0.66
                      ? "bg-gradient-to-br from-indigo-500 to-indigo-700 text-white border-transparent shadow-sm shadow-indigo-500/20"
                      : weight > 0.33
                        ? "bg-indigo-500/10 text-indigo-700 border-indigo-500/15 dark:text-indigo-200"
                        : "bg-slate-50 text-slate-600 border-slate-200/80 dark:bg-white/[0.03] dark:text-slate-300 dark:border-white/10";
                    return (
                      <span key={item.word} title={`${item.word}: ${item.total} vez(es)`} className={`inline-flex cursor-default items-center gap-1.5 rounded-full border px-3 py-1 font-medium transition-transform hover:-translate-y-0.5 ${tone}`} style={{ fontSize: `${0.75 + weight * 0.25}rem` }}>
                        {item.word}
                        <span className={`text-[10px] tabular-nums ${weight > 0.66 ? "text-white/70" : "text-slate-400 dark:text-slate-500"}`}>{item.total}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </section>

            <section className={`${cardClass} p-6`} aria-label="Atendimentos por região">
              <PanelHeader icon={MapPin} tone="emerald" title="Distribuição por região" subtitle="Estado e DDD do telefone de quem iniciou atendimento." />
              {regionTotal === 0 ? <EmptyState icon={MapPin} title="Sem DDD identificado" text="Nenhum atendimento com telefone brasileiro reconhecido no período." /> : (
                <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                  <div>
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Por estado</p>
                    <ul className="space-y-3">
                      {data.regions.states.slice(0, 8).map((item) => (
                        <li key={item.uf} title={`${item.uf}: ${item.total} atendimento(s)`}>
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{item.uf}</span>
                            <span className="tabular-nums text-slate-500 dark:text-slate-400"><b className="font-semibold text-slate-900 dark:text-white">{item.total}</b> · {Math.round((item.total / regionTotal) * 100)}%</span>
                          </div>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500/60 to-indigo-500" style={{ width: `${(item.total / maxState) * 100}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Principais DDDs</p>
                    <ul className="space-y-3">
                      {data.regions.ddds.slice(0, 8).map((item) => (
                        <li key={item.ddd}>
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 dark:bg-white/5 dark:text-slate-300">{item.ddd}</span>
                              <span className="truncate text-slate-600 dark:text-slate-300">{item.city || item.uf}/{item.uf}</span>
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-white">{item.total}</span>
                          </div>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500/60 to-emerald-500" style={{ width: `${(item.total / (data.regions.ddds[0]?.total || 1)) * 100}%` }} />
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
