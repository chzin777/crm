"use client";

import { useEffect, useState } from "react";
import { MessageCircleHeart, Send, Smile, Star, type LucideIcon } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";

type Period = "today" | "7d" | "30d";

type Report = {
  summary: { sent: number; answered: number; responseRate: number; average: number | null; satisfied: number; neutral: number; unsatisfied: number };
  distribution: { score: number; count: number }[];
  latest: { id: string; score: number; comment: string | null; answeredAt: string; contact: { name: string }; attendant: { name: string } | null; queue: { name: string } | null }[];
  attendants: { id: string; name: string }[];
};

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
];

const card = "rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07194f]";
const scoreClass = (score: number) =>
  score >= 4 ? "bg-[#C4D600]/25 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]" : score === 3 ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" : "bg-[#F7915E]/20 text-[#9a3f12] dark:text-[#F7915E]";

function Metric({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <article className={card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          <p className="mt-1 text-[10px] text-slate-400">{detail}</p>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]"><Icon className="h-4 w-4" /></span>
      </div>
    </article>
  );
}

export function NpsWhatsappPanel() {
  const [period, setPeriod] = useState<Period>("30d");
  const [attendantId, setAttendantId] = useState("");
  const [loaded, setLoaded] = useState<{ query: string; report: Report | null; error: string } | null>(null);
  const query = new URLSearchParams({ period, ...(attendantId ? { attendantId } : {}) }).toString();

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
    <section aria-label="Pesquisa de satisfação no WhatsApp" className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Atendimento no WhatsApp</h2>
          <p className="mt-1 text-[11px] text-slate-400">Notas de 1 a 5 enviadas pelos clientes ao final do atendimento.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Período" className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
            {PERIODS.map((item) => (
              <button key={item.id} type="button" aria-pressed={period === item.id} onClick={() => setPeriod(item.id)} className={`h-8 cursor-pointer rounded-md px-3 text-xs font-semibold transition-colors ${period === item.id ? "bg-[#C4D600] text-[#051647]" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}>{item.label}</button>
            ))}
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
            <Metric icon={Star} label="Média de satisfação" value={summary.average === null ? "—" : `${summary.average.toLocaleString("pt-BR")}/5`} detail="média das notas recebidas" />
            <Metric icon={Smile} label="Clientes satisfeitos" value={summary.answered ? `${summary.satisfied}%` : "—"} detail={`notas 4 e 5 · ${summary.neutral}% neutros · ${summary.unsatisfied}% insatisfeitos`} />
            <Metric icon={MessageCircleHeart} label="Taxa de resposta" value={summary.sent ? `${summary.responseRate}%` : "—"} detail="respondidas sobre enviadas" />
            <Metric icon={Send} label="Pesquisas" value={`${summary.answered} / ${summary.sent}`} detail="respondidas / enviadas" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            <article className={card}>
              <h3 className="mb-3 text-xs font-bold text-slate-900 dark:text-white">Distribuição das notas</h3>
              <ul className="space-y-2">
                {report.distribution.map((item) => (
                  <li key={item.score} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <span className="w-3 text-right font-semibold">{item.score}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><span className={`block h-full rounded-full ${item.score >= 4 ? "bg-[#C4D600]" : item.score === 3 ? "bg-slate-400" : "bg-[#F7915E]"}`} style={{ width: `${(item.count / highest) * 100}%` }} /></span>
                    <span className="w-6 text-right">{item.count}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
              <div className="border-b border-slate-100 p-4 dark:border-slate-800"><h3 className="text-xs font-bold text-slate-900 dark:text-white">Últimas avaliações</h3></div>
              {report.latest.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">Nenhuma avaliação neste período.</p>
              ) : (
                <div className="max-h-96 overflow-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead className="sticky top-0 bg-white text-slate-500 dark:bg-[#07194f] dark:text-slate-400">
                      <tr>{["Data/Hora", "Cliente", "Atendente", "Nota", "Comentário", "Fila"].map((title) => <th key={title} scope="col" className="px-4 py-2 font-semibold">{title}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {report.latest.map((item) => (
                        <tr key={item.id} className="text-slate-700 dark:text-slate-200">
                          <td className="whitespace-nowrap px-4 py-2">{new Date(item.answeredAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                          <td className="px-4 py-2 font-medium">{item.contact.name}</td>
                          <td className="px-4 py-2">{item.attendant?.name ?? "Sem atendente"}</td>
                          <td className="px-4 py-2"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${scoreClass(item.score)}`}><Star className="h-3 w-3 fill-current" />{item.score}</span></td>
                          <td className="px-4 py-2">{item.comment ?? "—"}</td>
                          <td className="px-4 py-2">{item.queue?.name ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </div>
        </div>
      )}
    </section>
  );
}
