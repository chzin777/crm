"use client";

import { useEffect, useState } from "react";
import { Award, MessageCircleHeart, MessageSquareText, Send, Star, Store, UserRound, Users, type LucideIcon } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { NPS_BANDS, NPS_BAND_BADGE, NPS_SURVEY_LABELS, NPS_SURVEY_TYPES, isNpsSurveyType, npsBand, type NpsMetrics, type NpsSurveyType } from "@/lib/nps-scale";

type Period = "today" | "7d" | "30d" | "90d";
type TypeFilter = "" | NpsSurveyType;
type Ranked = NpsMetrics & { name: string };

type Report = {
  summary: { sent: number; answered: number; responseRate: number; average: number | null; sum: number; nps: number | null; promoters: number; neutral: number; detractors: number; withComment: number };
  byType: (NpsMetrics & { type: NpsSurveyType })[];
  distribution: { score: number; count: number }[];
  latest: { id: string; score: number; comment: string | null; answeredAt: string; surveyType: string; source: string; orderKey: string | null; store: string | null; seller: string | null; contact: { name: string }; attendant: { name: string } | null; queue: { name: string } | null }[];
  stores: Ranked[];
  people: Ranked[];
  customers: { contactId: string; name: string; count: number; sum: number; average: number; latest: Partial<Record<NpsSurveyType, number>>; lastAnsweredAt: string }[];
  attendants: { id: string; name: string }[];
};

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "90d", label: "90 dias" },
];

const BAR: Record<ReturnType<typeof npsBand>, string> = { detractor: "bg-red-500", neutral: "bg-amber-400", promoter: "bg-emerald-500" };
const card = "rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07194f]";
const segmentButton = (active: boolean) => `h-8 cursor-pointer rounded-md px-3 text-xs font-semibold transition-colors ${active ? "bg-[#C4D600] text-[#051647]" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`;
const surveyLabel = (type: string) => (isNpsSurveyType(type) ? NPS_SURVEY_LABELS[type] : type);
const number = (value: number | null | undefined, digits = 1) => (value === null || value === undefined ? "—" : value.toLocaleString("pt-BR", { maximumFractionDigits: digits }));

/** Nota com a cor da faixa: vermelha (0 a 6), âmbar (7 e 8) e verde (9 e 10). */
export function NpsScoreBadge({ score }: { score: number }) {
  const band = npsBand(score);
  return <span title={NPS_BANDS[band].label} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${NPS_BAND_BADGE[band]}`}><Star className="h-3 w-3 fill-current" />{score.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <article className={card}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          <p className="mt-1 break-words text-[10px] text-slate-400">{detail}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]"><Icon className="h-4 w-4" /></span>
      </div>
    </article>
  );
}

function Ranking({ icon: Icon, title, rows, empty }: { icon: LucideIcon; title: string; rows: Ranked[]; empty: string }) {
  return (
    <article className={card}>
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white"><Icon className="h-3.5 w-3.5 text-[#002187] dark:text-[#C4D600]" />{title}</h3>
      {rows.length === 0 ? <p className="text-xs text-slate-400">{empty}</p> : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.name} className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-slate-700 dark:text-slate-200" title={row.name}>{row.name}</span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums text-slate-500 dark:text-slate-400">
                <span>{row.count} resp. · média {number(row.average)}</span>
                <span className={`rounded-md px-1.5 py-0.5 font-bold ${row.nps === null ? "" : row.nps >= 50 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : row.nps >= 0 ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"}`}>NPS {number(row.nps, 0)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function NpsWhatsappPanel() {
  const [period, setPeriod] = useState<Period>("30d");
  const [type, setType] = useState<TypeFilter>("");
  const [attendantId, setAttendantId] = useState("");
  const [loaded, setLoaded] = useState<{ query: string; report: Report | null; error: string } | null>(null);
  const query = new URLSearchParams({ period, ...(type ? { type } : {}), ...(attendantId ? { attendantId } : {}) }).toString();

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/nps/whatsapp?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as Report & { error?: string };
        if (!response.ok) throw new Error(result.error || "Não foi possível carregar as avaliações.");
        setLoaded({ query, report: result, error: "" });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoaded({ query, report: null, error: error instanceof Error ? error.message : "Não foi possível carregar as avaliações." });
      });
    return () => controller.abort();
  }, [query]);

  const loading = loaded?.query !== query;
  const report = loaded?.report ?? null;
  const summary = report?.summary;
  const highest = Math.max(1, ...(report?.distribution.map((item) => item.count) ?? []));

  return (
    <section aria-label="Pesquisas de NPS no WhatsApp" className="space-y-4">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">NPS no WhatsApp (0 a 10)</h2>
          <p className="mt-1 text-[11px] text-slate-400">Encerramento do atendimento, 20 minutos após a compra (atendimento) e 30 dias após a compra (produto e adaptação). 0 a 6 baixa, 7 e 8 boa, 9 e 10 excelente.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Período" className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
            {PERIODS.map((item) => <button key={item.id} type="button" aria-pressed={period === item.id} onClick={() => setPeriod(item.id)} className={segmentButton(period === item.id)}>{item.label}</button>)}
          </div>
          <div role="group" aria-label="Pesquisa" className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
            {([["", "Todas"], ...NPS_SURVEY_TYPES.map((item) => [item, NPS_SURVEY_LABELS[item]])] as [TypeFilter, string][]).map(([id, label]) => <button key={id || "all"} type="button" aria-pressed={type === id} onClick={() => setType(id)} className={segmentButton(type === id)}>{label}</button>)}
          </div>
          <select aria-label="Atendente" value={attendantId} onChange={(event) => setAttendantId(event.target.value)} className="h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <option value="">Todos os atendentes</option>
            {report?.attendants.map((attendant) => <option key={attendant.id} value={attendant.id}>{attendant.name}</option>)}
          </select>
        </div>
      </div>

      {loaded?.error && !loading && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loaded.error}</p>}

      {loading && !report ? (
        <div className="grid min-h-40 place-items-center"><LoadingSpinner label="Carregando avaliações..." /></div>
      ) : summary && report && (
        <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Award} label="NPS" value={number(summary.nps, 0)} detail={`${summary.promoters}% promotores · ${summary.neutral}% neutros · ${summary.detractors}% detratores`} />
            <Metric icon={Star} label="Nota média" value={summary.average === null ? "—" : `${number(summary.average)}/10`} detail={`soma das notas: ${summary.sum}`} />
            <Metric icon={MessageCircleHeart} label="Taxa de resposta" value={summary.sent ? `${summary.responseRate}%` : "—"} detail={`${summary.answered} respondidas de ${summary.sent} enviadas`} />
            <Metric icon={MessageSquareText} label="Com comentário" value={String(summary.withComment)} detail="clientes que deixaram um comentário" />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {report.byType.map((item) => (
              <article key={item.type} className={card}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">NPS {NPS_SURVEY_LABELS[item.type]}</h3>
                  <span className="text-[10px] text-slate-400">{item.type === "ATENDIMENTO" ? "encerramento e 20 min após a compra" : "30 dias após a compra"}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
                  <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{number(item.nps, 0)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">média {number(item.average)} · soma {item.sum} · {item.count} respostas</p>
                </div>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <span className="bg-emerald-500" style={{ width: `${item.count ? (item.promoters / item.count) * 100 : 0}%` }} />
                  <span className="bg-amber-400" style={{ width: `${item.count ? (item.neutrals / item.count) * 100 : 0}%` }} />
                  <span className="bg-red-500" style={{ width: `${item.count ? (item.detractors / item.count) * 100 : 0}%` }} />
                </div>
              </article>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
            <article className={card}>
              <h3 className="mb-3 text-xs font-bold text-slate-900 dark:text-white">Distribuição das notas</h3>
              <ul className="space-y-1.5">
                {report.distribution.map((item) => (
                  <li key={item.score} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <span className="w-5 text-right font-semibold tabular-nums">{item.score}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><span className={`block h-full rounded-full ${BAR[npsBand(item.score)]}`} style={{ width: `${(item.count / highest) * 100}%` }} /></span>
                    <span className="w-6 text-right tabular-nums">{item.count}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                {(Object.keys(NPS_BANDS) as (keyof typeof NPS_BANDS)[]).map((band) => <span key={band} className={`rounded-full px-2 py-0.5 font-semibold ${NPS_BAND_BADGE[band]}`}>{NPS_BANDS[band].range} {NPS_BANDS[band].label.toLowerCase()}</span>)}
              </div>
            </article>

            <article className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
              <div className="border-b border-slate-100 p-4 dark:border-slate-800"><h3 className="text-xs font-bold text-slate-900 dark:text-white">Últimas avaliações</h3></div>
              {report.latest.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">Nenhuma avaliação neste período.</p>
              ) : (
                <div className="max-h-96 overflow-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="sticky top-0 bg-white text-slate-500 dark:bg-[#07194f] dark:text-slate-400">
                      <tr>{["Data/Hora", "Cliente", "Pesquisa", "Nota", "Comentário", "Loja / atendente"].map((title) => <th key={title} scope="col" className="px-4 py-2 font-semibold">{title}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {report.latest.map((item) => (
                        <tr key={item.id} className="align-top text-slate-700 dark:text-slate-200">
                          <td className="whitespace-nowrap px-4 py-2">{new Date(item.answeredAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })}</td>
                          <td className="px-4 py-2 font-medium">{item.contact.name}</td>
                          <td className="px-4 py-2">{surveyLabel(item.surveyType)}{item.orderKey ? <span className="block text-[10px] text-slate-400">Pedido {item.orderKey}</span> : null}</td>
                          <td className="px-4 py-2"><NpsScoreBadge score={item.score} /></td>
                          <td className="max-w-xs break-words px-4 py-2">{item.comment ?? "—"}</td>
                          <td className="px-4 py-2">{[item.store, item.attendant?.name ?? item.seller ?? item.queue?.name].filter(Boolean).join(" · ") || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Ranking icon={Store} title="NPS por loja" rows={report.stores} empty="Sem pesquisas pós-compra no período." />
            <Ranking icon={UserRound} title="NPS por atendente / vendedor" rows={report.people} empty="Sem avaliações com atendente no período." />
          </div>

          <article className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white"><Users className="h-3.5 w-3.5 text-[#002187] dark:text-[#C4D600]" />Notas por cliente (soma e média)</h3>
              <span className="text-[10px] text-slate-400">Clientes que responderam no período · histórico completo na escala 0 a 10</span>
            </div>
            {report.customers.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum cliente respondeu no período.</p>
            ) : (
              <div className="max-h-96 overflow-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="sticky top-0 bg-white text-slate-500 dark:bg-[#07194f] dark:text-slate-400">
                    <tr>{["Cliente", "Atendimento", "Produto e adaptação", "Soma", "Média", "Respostas"].map((title) => <th key={title} scope="col" className="px-4 py-2 font-semibold">{title}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {report.customers.map((item) => (
                      <tr key={item.contactId} className="text-slate-700 dark:text-slate-200">
                        <td className="px-4 py-2 font-medium">{item.name}</td>
                        <td className="px-4 py-2">{item.latest.ATENDIMENTO === undefined ? "—" : <NpsScoreBadge score={item.latest.ATENDIMENTO} />}</td>
                        <td className="px-4 py-2">{item.latest.PRODUTO_ADAPTACAO === undefined ? "—" : <NpsScoreBadge score={item.latest.PRODUTO_ADAPTACAO} />}</td>
                        <td className="px-4 py-2 font-semibold tabular-nums">{item.sum}</td>
                        <td className="px-4 py-2"><NpsScoreBadge score={item.average} /></td>
                        <td className="px-4 py-2 tabular-nums">{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </div>
      )}
      <p className="flex items-center gap-1.5 text-[10px] text-slate-400"><Send className="h-3 w-3" />Avaliações antigas de 1 a 5 não entram nestes números.</p>
    </section>
  );
}
