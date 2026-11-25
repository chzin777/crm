"use client";

import { useCallback, useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgeDollarSign, Megaphone, Percent, Receipt, ShieldAlert, ShoppingBag, Sparkles, Users } from "lucide-react";
import { EmptyState, KpiCard, PanelHeader, cardClass, chartTheme } from "@/components/dashboard/DashboardKit";
import type { ConversionReport } from "@/lib/commercial/jobs-db";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const percent = (value: number) => `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const formatDay = (day: string) => day.split("-").reverse().join("/");

function ConversionTable({ title, icon, rows }: { title: string; icon: React.ElementType; rows: ConversionReport["byAttendant"] }) {
  return (
    <section className={`${cardClass} min-w-0 p-6`}>
      <PanelHeader icon={icon} tone="indigo" title={title} subtitle="Atendimentos, vendas faturadas no VMSet em até 15 dias, taxa, ticket médio e receita atribuída." />
      {rows.length === 0 ? <EmptyState icon={icon} title="Sem atendimentos" text="Nenhum atendimento com mensagem do cliente no período." /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:border-white/10 dark:text-slate-400">
                <th className="py-2 pr-3 font-semibold">Grupo</th>
                <th className="py-2 pr-3 text-right font-semibold">Atendimentos</th>
                <th className="py-2 pr-3 text-right font-semibold">Convertidos</th>
                <th className="py-2 pr-3 text-right font-semibold">Taxa</th>
                <th className="py-2 pr-3 text-right font-semibold">Ticket médio</th>
                <th className="py-2 text-right font-semibold">Receita</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-slate-100 last:border-0 dark:border-white/5">
                  <td className="max-w-[260px] truncate py-2 pr-3 font-medium text-slate-800 dark:text-slate-100" title={row.key}>{row.key}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{row.attended}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{row.converted}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-semibold text-[#002187] dark:text-[#C4D600]">{percent(row.rate)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{row.sales ? money(row.ticket) : "—"}</td>
                  <td className="py-2 text-right tabular-nums font-semibold text-slate-900 dark:text-white">{money(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Conversão Real (CRM x VMSet) e ranking de motivos de perda dentro de /metricas-atendimento, no mesmo período.
 * As regras de disparo (pós-venda e recuperação de orçamento) ficam em /automacoes.
 */
export function ConversionInsights({ start, end, isDark, reloadToken }: { start: string; end: string; isDark: boolean; reloadToken: number }) {
  const theme = chartTheme(isDark);
  const [data, setData] = useState<ConversionReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [reload, setReload] = useState(0);
  const query = `start=${start}&end=${end}`;

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/dashboard/conversion?${query}`, { signal });
      const body = (await response.json()) as { data?: ConversionReport; error?: string };
      if (!response.ok || !body.data) setError(body.error ?? "Não foi possível carregar a conversão.");
      else setData(body.data);
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") setError("Não foi possível carregar a conversão.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reload, reloadToken]);

  const analyze = async () => {
    setAnalyzing(true);
    const response = await fetch(`/api/dashboard/conversion?${query}`, { method: "POST" });
    setAnalyzing(false);
    if (!response.ok) setError(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Não foi possível analisar.");
    else setReload((value) => value + 1);
  };

  const maxObjection = Math.max(1, ...(data?.objections ?? []).map((item) => item.count));

  return (
    <div id="conversao" className="scroll-mt-6 space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-600 dark:text-[#C4D600]">CRM x VMSet</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Conversão Real</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Vendas faturadas no VMSet até 15 dias após o atendimento (mesmo cliente por cadastro, telefone ou CPF).</p>
      </div>
      {error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
      {!data && !error && <p className="text-sm text-slate-400">Calculando a conversão do período...</p>}
      {data && (
        <div className={`space-y-6 transition-opacity duration-300 ${loading ? "pointer-events-none opacity-60" : ""}`} aria-busy={loading}>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={Percent} tone="indigo" label="Taxa de conversão" value={percent(data.totals.rate)} hint="Atendimentos com venda faturada em até 15 dias ÷ atendimentos com mensagem do cliente." meta={<><b className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{data.totals.converted}</b> de {data.totals.attended} atendimentos</>} />
            <KpiCard icon={BadgeDollarSign} tone="emerald" label="Receita atribuída" value={money(data.totals.revenue)} hint="Soma dos pedidos do VMSet atribuídos a um atendimento (cada pedido conta uma vez)." meta={<><b className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{data.totals.sales}</b> pedidos</>} />
            <KpiCard icon={Receipt} tone="sky" label="Ticket médio" value={data.totals.sales ? money(data.totals.ticket) : "—"} hint="Receita atribuída ÷ pedidos atribuídos." />
            <KpiCard icon={Users} tone="violet" label="Atendimentos" value={String(data.totals.attended)} hint="Conversas iniciadas no período com ao menos uma mensagem do cliente." />
          </div>

          <section className={`${cardClass} p-6`}>
            <PanelHeader icon={ShoppingBag} tone="indigo" title="Atendimentos e conversões por dia" subtitle="Atendimentos iniciados (barras) e atendimentos convertidos (linha)." />
            {data.byDay.length === 0 ? <EmptyState icon={ShoppingBag} title="Sem dados" text="Nenhum atendimento no período." /> : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.byDay.map((item) => ({ ...item, label: formatDay(item.day).slice(0, 5) }))}>
                    <CartesianGrid stroke={theme.grid} vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} width={32} />
                    <Tooltip formatter={(value, name) => [String(value), name === "attended" ? "Atendimentos" : name === "converted" ? "Convertidos" : String(name)]} />
                    <Bar dataKey="attended" fill="#002187" radius={[4, 4, 0, 0]} />
                    <Line dataKey="converted" stroke="#C4D600" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
            <ConversionTable title="Conversão por atendente" icon={Users} rows={data.byAttendant} />
            <ConversionTable title="Conversão por origem do lead" icon={Megaphone} rows={data.byOrigin} />
          </div>

          <section className={`${cardClass} p-6`}>
            <PanelHeader icon={ShieldAlert} tone="rose" title="Ranking de motivos de perda" subtitle={`Conversas encerradas sem venda (análise semanal automática às segundas). ${data.objectionTotal} conversas classificadas.`}>
              <button type="button" onClick={() => void analyze()} disabled={analyzing} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-[#002187] hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:text-[#C4D600] dark:hover:bg-white/10">
                <Sparkles className="h-4 w-4" />{analyzing ? "Analisando..." : "Analisar período"}
              </button>
            </PanelHeader>
            {data.objections.length === 0 ? <EmptyState icon={ShieldAlert} title="Sem motivos classificados" text="Clique em Analisar período ou aguarde a análise semanal." /> : (
              <ol className="space-y-3">
                {data.objections.map((item, index) => (
                  <li key={item.reason} className="min-w-0">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-100">{index + 1}. {item.label}</span>
                      <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{item.count} · {percent(item.share)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                      <div className="h-full rounded-full bg-[#F7915E]" style={{ width: `${(item.count / maxObjection) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
