"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, Clock, Headphones, Hourglass, MapPin, MessageCircleReply, MessagesSquare, RefreshCw, Star, Users } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
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

/** Variação percentual contra o período anterior; lowerIsBetter para tempos. */
function Delta({ value, previous, lowerIsBetter = false }: { value: number | null; previous: number | null; lowerIsBetter?: boolean }) {
  if (value === null || previous === null || previous === 0) return <span className="text-[11px] text-slate-400">sem comparação</span>;
  const change = ((value - previous) / previous) * 100;
  if (Math.abs(change) < 0.5) return <span className="text-[11px] font-semibold text-slate-500">= período anterior</span>;
  const good = lowerIsBetter ? change < 0 : change > 0;
  const Icon = change > 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${good ? "text-emerald-600 dark:text-emerald-400" : "text-[#c2410c] dark:text-[#F7915E]"}`}>
      <Icon className="h-3 w-3" />{Math.abs(change).toFixed(0)}% vs. anterior
    </span>
  );
}

function KpiCard({ icon: Icon, label, hint, value, children }: { icon: React.ElementType; label: string; hint: string; value: string; children?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07194f]" aria-label={label}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">{value}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#002187] dark:bg-blue-950/50 dark:text-[#C4D600]"><Icon className="h-4 w-4" /></span>
      </div>
      <div className="mt-2 space-y-1">{children}</div>
      <p className="mt-2 text-[11px] leading-snug text-slate-400 dark:text-slate-500">{hint}</p>
    </section>
  );
}

function SlaBadge({ seconds, warn, breach }: { seconds: number | null; warn: number; breach: number }) {
  if (seconds === null) return null;
  if (seconds > breach) return <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/30 dark:text-red-300">Fora do SLA</span>;
  if (seconds > warn) return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Atenção</span>;
  return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">No SLA</span>;
}

function SortHeader({ label, column, align, sort, onSort }: { label: string; column: SortKey; align: "left" | "right"; sort: { key: SortKey; dir: "asc" | "desc" }; onSort: (key: SortKey) => void }) {
  return (
    <th scope="col" className={`px-3 py-2 font-semibold ${align === "left" ? "text-left" : "text-right"}`} aria-sort={sort.key === column ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(column)} className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-900 dark:hover:text-white">
        {label}
        {sort.key === column ? (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

const panelClass ="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07194f] sm:p-5";
const selectClass = "h-10 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-200 dark:focus:border-[#C4D600]";

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

  const tooltipStyle = { backgroundColor: isDark ? "#07194f" : "#ffffff", borderColor: isDark ? "#334155" : "#e2e8f0", borderRadius: 10, color: isDark ? "#f1f5f9" : "#0f172a" };
  const timeline = (data?.timeline ?? []).map((item) => ({ ...item, label: `${item.day.slice(8, 10)}/${item.day.slice(5, 7)}` }));
  const maxWord = Math.max(1, ...(data?.words ?? []).map((item) => item.total));
  const maxState = Math.max(1, ...(data?.regions.states ?? []).map((item) => item.total));
  const regionTotal = (data?.regions.states ?? []).reduce((sum, item) => sum + item.total, 0);
  const npsMax = Math.max(1, ...(data?.kpis.nps.distribution ?? []).map((item) => item.total));

  if (!result) return <LoadingSpinner fullScreen label="Calculando métricas de atendimento..." size={96} />;

  const header = (label: string, column: SortKey, align: "left" | "right" = "right") => (
    <SortHeader label={label} column={column} align={align} sort={sort} onSort={toggleSort} />
  );

  return (
    <main className="space-y-5 px-4 pb-10 pt-8 sm:px-8">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Métricas de Atendimento</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Tempos, volume, satisfação e desempenho da equipe no WhatsApp
            {data && <> · {data.period.startDay.split("-").reverse().join("/")} a {data.period.endDay.split("-").reverse().join("/")}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-300">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <span className="sr-only">Período</span>
            <select value={filters.preset} onChange={(event) => setFilters((current) => ({ ...current, preset: event.target.value as PeriodPreset }))} className="cursor-pointer bg-transparent outline-none">
              {(Object.keys(PRESET_LABELS) as PeriodPreset[]).map((preset) => <option key={preset} value={preset}>{PRESET_LABELS[preset]}</option>)}
            </select>
          </label>
          {filters.preset === "custom" && (
            <div className="flex items-center gap-1.5">
              <input type="date" aria-label="Data inicial" value={filters.start} max={filters.end} onChange={(event) => event.target.value && setFilters((current) => ({ ...current, start: event.target.value }))} className={selectClass} />
              <span className="text-xs text-slate-400">até</span>
              <input type="date" aria-label="Data final" value={filters.end} min={filters.start} max={todayBrt()} onChange={(event) => event.target.value && setFilters((current) => ({ ...current, end: event.target.value }))} className={selectClass} />
            </div>
          )}
          <select aria-label="Fila" value={filters.queueId} onChange={(event) => setFilters((current) => ({ ...current, queueId: event.target.value }))} className={selectClass}>
            <option value="">Todas as filas</option>
            {options?.queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
          </select>
          <select aria-label="Atendente" value={filters.assigneeId} onChange={(event) => setFilters((current) => ({ ...current, assigneeId: event.target.value }))} className={selectClass}>
            <option value="">Todos os atendentes</option>
            {options?.operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.name}</option>)}
          </select>
          <button type="button" onClick={() => setReloadToken((token) => token + 1)} disabled={loading} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Atualizar
          </button>
        </div>
      </div>

      {result.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">{result.error}</p>}

      {data && (
        <div className={`space-y-5 transition-opacity duration-200 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard icon={Hourglass} label="TME · Espera" value={formatDuration(data.kpis.tme.value)} hint="Da primeira mensagem do cliente até a primeira resposta de um atendente.">
              <Delta value={data.kpis.tme.value} previous={data.kpis.tme.previous} lowerIsBetter />
            </KpiCard>
            <KpiCard icon={Headphones} label="TMA · Atendimento" value={formatDuration(data.kpis.tma.value)} hint="Da primeira resposta do atendente até o encerramento.">
              <Delta value={data.kpis.tma.value} previous={data.kpis.tma.previous} lowerIsBetter />
            </KpiCard>
            <KpiCard icon={MessageCircleReply} label="TMR · Resposta" value={formatDuration(data.kpis.tmr.value)} hint={`Tempo para responder cada mensagem do cliente (${data.kpis.tmr.samples} respostas).`}>
              <Delta value={data.kpis.tmr.value} previous={data.kpis.tmr.previous} lowerIsBetter />
            </KpiCard>
            <KpiCard icon={MessagesSquare} label="Volume" value={`${data.kpis.volume.started} / ${data.kpis.volume.closed}`} hint="Atendimentos iniciados / encerrados no período.">
              <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">Iniciados <Delta value={data.kpis.volume.started} previous={data.kpis.volume.prevStarted} /></p>
              <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">Encerrados <Delta value={data.kpis.volume.closed} previous={data.kpis.volume.prevClosed} /></p>
            </KpiCard>
            <KpiCard icon={Star} label="NPS · Satisfação" value={data.kpis.nps.value === null ? "—" : `${data.kpis.nps.value.toFixed(1)} / 5`} hint={`${data.kpis.nps.total} avaliação(ões) respondida(s).`}>
              <Delta value={data.kpis.nps.value} previous={data.kpis.nps.previous} />
              <div className="flex h-10 items-end gap-1 pt-1" aria-label="Distribuição das notas">
                {data.kpis.nps.distribution.map((item) => (
                  <div key={item.score} className="flex flex-1 flex-col items-center gap-0.5" title={`Nota ${item.score}: ${item.total}`}>
                    <div className={`w-full rounded-t ${item.score >= 4 ? "bg-emerald-500" : item.score === 3 ? "bg-amber-400" : "bg-[#F7915E]"}`} style={{ height: `${Math.max(2, (item.total / npsMax) * 28)}px` }} />
                    <span className="text-[9px] font-semibold text-slate-400">{item.score}</span>
                  </div>
                ))}
              </div>
            </KpiCard>
          </div>

          <section className={panelClass} aria-label="Atendimentos por dia">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Atendimentos por dia</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Iniciados e encerrados em cada dia do período.</p>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={isDark ? "#1e335b" : "#e2e8f0"} vertical={false} strokeDasharray="3 4" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} dy={8} minTickGap={12} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} width={32} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: isDark ? "#0b2463" : "#f1f5f9" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar isAnimationActive={false} dataKey="started" name="Iniciados" fill={isDark ? "#C4D600" : "#002187"} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar isAnimationActive={false} dataKey="closed" name="Encerrados" fill={isDark ? "#64748b" : "#94a3b8"} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className={panelClass} aria-label="Ranking de atendentes">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Users className="h-4 w-4" />Desempenho dos atendentes</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">SLA de resposta: até {formatDuration(data.sla.warn)} ok · até {formatDuration(data.sla.breach)} atenção · acima disso fora do SLA.</p>
              </div>
            </div>
            {ranking.length === 0 ? <p className="py-8 text-center text-xs text-slate-500">Nenhum atendimento humano no período.</p> : (
              <div className="custom-scrollbar overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <tr>
                      <th scope="col" className="w-10 px-3 py-2 text-left font-semibold">#</th>
                      {header("Atendente", "name", "left")}
                      {header("Encerrados", "closed")}
                      {header("TMA", "tma")}
                      {header("TMR", "tmr")}
                      {header("NPS", "nps")}
                      <th scope="col" className="px-3 py-2 text-right font-semibold">SLA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {ranking.map((row, index) => (
                      <tr key={row.userId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-2.5 text-xs font-bold text-slate-400">{index + 1}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-white">{row.name}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{row.closed}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{formatDuration(row.tma)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{formatDuration(row.tmr)}{row.responses > 0 && <span className="ml-1 text-[10px] text-slate-400">({row.responses})</span>}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{row.nps === null ? "—" : row.nps.toFixed(1)}{row.npsCount > 0 && <span className="ml-1 text-[10px] text-slate-400">({row.npsCount})</span>}</td>
                        <td className="px-3 py-2.5 text-right"><SlaBadge seconds={row.tmr} warn={data.sla.warn} breach={data.sla.breach} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <section className={panelClass} aria-label="Termos mais frequentes">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Termos mais frequentes</h2>
              <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Palavras mais usadas pelos clientes (sem palavras comuns como &quot;que&quot;, &quot;para&quot;, &quot;obrigado&quot;).</p>
              {data.words.length === 0 ? <p className="py-8 text-center text-xs text-slate-500">Sem mensagens de clientes no período.</p> : (
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 py-2">
                  {data.words.map((item, index) => {
                    const weight = item.total / maxWord;
                    return (
                      <span
                        key={item.word}
                        title={`${item.word}: ${item.total} vez(es)`}
                        className={`cursor-default leading-none transition-transform hover:scale-110 ${index % 3 === 0 ? "text-[#002187] dark:text-[#C4D600]" : index % 3 === 1 ? "text-[#051647] dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}
                        style={{ fontSize: `${0.75 + weight * 1.25}rem`, fontWeight: weight > 0.5 ? 700 : weight > 0.25 ? 600 : 400, opacity: 0.55 + weight * 0.45 }}
                      >
                        {item.word}
                      </span>
                    );
                  })}
                </div>
              )}
            </section>

            <section className={panelClass} aria-label="Atendimentos por região">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><MapPin className="h-4 w-4" />Atendimentos por região (DDD)</h2>
              <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Estado e DDD do telefone de quem iniciou atendimento no período.</p>
              {regionTotal === 0 ? <p className="py-8 text-center text-xs text-slate-500">Sem atendimentos com DDD identificado.</p> : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Por estado</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {data.regions.states.map((item) => {
                        const weight = item.total / maxState;
                        return (
                          <div key={item.uf} title={`${item.uf}: ${item.total} atendimento(s)`} className="rounded-lg px-2 py-2 text-center" style={{ backgroundColor: `rgba(${isDark ? "196, 214, 0" : "0, 33, 135"}, ${0.08 + weight * 0.72})` }}>
                            <p className={`text-xs font-bold ${weight > 0.5 ? (isDark ? "text-[#051647]" : "text-white") : "text-slate-800 dark:text-slate-100"}`}>{item.uf}</p>
                            <p className={`text-[10px] tabular-nums ${weight > 0.5 ? (isDark ? "text-[#051647]/80" : "text-white/80") : "text-slate-500 dark:text-slate-300"}`}>{Math.round((item.total / regionTotal) * 100)}%</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Principais DDDs</p>
                    <ul className="space-y-1.5">
                      {data.regions.ddds.slice(0, 8).map((item) => (
                        <li key={item.ddd} className="text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-slate-700 dark:text-slate-200"><span className="font-bold">{item.ddd}</span> · {item.city || item.uf}/{item.uf}</span>
                            <span className="shrink-0 tabular-nums font-semibold text-slate-900 dark:text-white">{item.total}</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className="h-full rounded-full bg-[#002187] dark:bg-[#C4D600]" style={{ width: `${(item.total / (data.regions.ddds[0]?.total || 1)) * 100}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-slate-400"><Clock className="h-3 w-3" />Dados atualizados a cada minuto. Conversas que só guardam envios de campanha sem resposta não entram nas contas.</p>
        </div>
      )}
    </main>
  );
}
