"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { NpsScoreBadge } from "@/components/NpsWhatsappPanel";
import { NPS_SURVEY_LABELS, isNpsSurveyType, type CustomerNps } from "@/lib/nps-scale";

type Answer = { id: string; score: number; comment: string | null; answeredAt: string; surveyType: string; orderKey: string | null; store: string | null };

/** NPS do cliente no perfil: notas individuais (atendimento e produto), soma e média geral. */
export function ContactNpsSummary({ contactId }: { contactId: string }) {
  const [loaded, setLoaded] = useState<{ id: string; answers: Answer[]; summary: CustomerNps | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/nps/contacts/${contactId}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as { data?: { answers: Answer[]; summary: CustomerNps | null } };
        if (response.ok && result.data) setLoaded({ id: contactId, ...result.data });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [contactId]);

  if (!loaded || loaded.id !== contactId || !loaded.summary) return null;
  const { summary, answers } = loaded;
  return (
    <section aria-label="NPS do cliente" className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100"><Star className="h-3.5 w-3.5 text-[#002187] dark:text-[#C4D600]" />NPS do cliente</h4>
        <p className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span>Soma <b className="tabular-nums text-slate-800 dark:text-slate-100">{summary.sum}</b></span>
          <span>Média <NpsScoreBadge score={summary.average} /></span>
          <span>{summary.count} avaliação{summary.count === 1 ? "" : "ões"}</span>
        </p>
      </div>
      <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
        {answers.slice(0, 8).map((answer) => (
          <li key={answer.id} className="flex min-w-0 items-start gap-2 py-1.5 text-xs">
            <NpsScoreBadge score={answer.score} />
            <div className="min-w-0 flex-1">
              <p className="text-slate-700 dark:text-slate-200">{isNpsSurveyType(answer.surveyType) ? NPS_SURVEY_LABELS[answer.surveyType] : answer.surveyType}<span className="text-[10px] text-slate-400"> · {new Date(answer.answeredAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}{answer.orderKey ? ` · pedido ${answer.orderKey}` : ""}</span></p>
              {answer.comment && <p className="break-words text-[11px] text-slate-500 dark:text-slate-400">“{answer.comment}”</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
