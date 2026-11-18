"use client";

import { AlertTriangle, Info, Loader2, Users } from "lucide-react";
import type { SegmentOverlapSummary } from "@/lib/campaign-audience";

const int = (value: number) => value.toLocaleString("pt-BR");

/**
 * Resumo do público quando 2+ segmentos são escolhidos: soma bruta × destinatários únicos, quantos estão em
 * mais de um segmento (unificados) e quais segmentos não acrescentam ninguém novo.
 */
export function AudienceOverlapNotice({
  state,
  hasFilters,
}: {
  state: { loading: boolean; summary?: SegmentOverlapSummary; finalUnique?: number; error?: string };
  hasFilters: boolean;
}) {
  if (state.loading) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />Cruzando os segmentos selecionados...
      </p>
    );
  }
  if (state.error) return <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{state.error}</p>;
  const summary = state.summary;
  if (!summary) return null;
  const finalUnique = state.finalUnique ?? summary.unique;
  const contained = summary.segments.filter((segment) => segment.contained);
  const empty = summary.segments.filter((segment) => segment.total === 0);

  return (
    <section role="status" aria-label="Resumo do público" className="min-w-0 space-y-2 rounded-xl border border-[#002187]/15 bg-[#002187]/5 p-3 text-xs text-slate-600 dark:border-[#C4D600]/20 dark:bg-[#C4D600]/5 dark:text-slate-300">
      <div className="flex items-start gap-2">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
        <div className="min-w-0 break-words">
          <p className="font-semibold text-slate-800 dark:text-white">
            {int(finalUnique)} destinatários únicos receberão o disparo
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Soma dos segmentos: {int(summary.rawTotal)} · Únicos após unir: {int(summary.unique)}
            {hasFilters && finalUnique !== summary.unique ? ` · Após os filtros adicionais: ${int(finalUnique)}` : ""}
          </p>
        </div>
      </div>
      {summary.inMultipleSegments > 0 ? (
        <p className="flex items-start gap-2 break-words">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#002187] dark:text-[#C4D600]" />
          <span><b className="text-slate-900 dark:text-white">{int(summary.inMultipleSegments)}</b> contatos pertencem a mais de um segmento selecionado e foram deduplicados automaticamente — cada cliente receberá apenas 1 mensagem.</span>
        </p>
      ) : (
        <p className="flex items-start gap-2 break-words">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#002187] dark:text-[#C4D600]" />
          <span>Nenhum contato se repete entre os segmentos selecionados.</span>
        </p>
      )}
      <ul className="space-y-0.5 text-[11px]">
        {summary.segments.map((segment, index) => (
          <li key={`${segment.label}-${index}`} className="flex min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 truncate" title={segment.label}>{segment.label}</span>
            <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{int(segment.total)} contatos · {int(segment.exclusive)} só neste</span>
          </li>
        ))}
      </ul>
      {contained.map((segment, index) => (
        <p key={`contido-${segment.label}-${index}`} className="flex items-start gap-2 rounded-lg bg-[#F7915E]/10 px-2 py-1.5 text-[11px] text-[#9a3d12] break-words dark:text-[#F7915E]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>O segmento &quot;{segment.label}&quot; está 100% contido nos outros selecionados e não adicionou novos destinatários únicos à campanha.</span>
        </p>
      ))}
      {empty.map((segment, index) => (
        <p key={`vazio-${segment.label}-${index}`} className="flex items-start gap-2 rounded-lg bg-[#F7915E]/10 px-2 py-1.5 text-[11px] text-[#9a3d12] break-words dark:text-[#F7915E]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>O segmento &quot;{segment.label}&quot; está sem contatos no momento.</span>
        </p>
      ))}
    </section>
  );
}
