"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";

type Summary = { nps: number | null; average: number | null; answered: number; sent: number; responseRate: number; promoters: number; neutrals: number; detractors: number };

export function AiNpsSummary() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ai/nps", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar o NPS da IA.");
        setSummary(await response.json() as Summary);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Não foi possível carregar o NPS da IA.");
      });
    return () => controller.abort();
  }, []);

  return (
    <section aria-label="NPS da Assistente IA" className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Bot className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" />NPS da Assistente IA · últimos 30 dias</h2>
      {error ? <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p> : !summary ? <p className="mt-2 text-xs text-slate-500">Carregando avaliações...</p> : (
        <div className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-3 dark:text-slate-200">
          <p>NPS: <strong>{summary.nps ?? "—"}</strong> · Média: <strong>{summary.average ?? "—"}</strong></p>
          <p>Avaliações: <strong>{summary.answered}</strong> · Resposta: <strong>{summary.sent ? `${summary.responseRate}%` : "—"}</strong></p>
          <p>Promotores {summary.promoters}% · Neutros {summary.neutrals}% · Detratores {summary.detractors}%</p>
        </div>
      )}
    </section>
  );
}
