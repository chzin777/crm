"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, ExternalLink, FileText, MapPin, Target } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import type { CustomerType, PipelineCard } from "@/lib/sales-pipeline";

type Stage = { id: string; titulo: string };

/**
 * Oportunidade ativa do cliente no funil de vendas: etapa em seletor inline (movimento manual registrado no card),
 * valor e atalho para o Pipeline. Devolve a classificação Novo/Recorrente para o cabeçalho do modal.
 */
export function ContactOpportunityCard({ contactId, canWrite, onRecurrence }: { contactId: string; canWrite: boolean; onRecurrence?: (type: CustomerType | null) => void }) {
  const toast = useToast();
  const [card, setCard] = useState<PipelineCard | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/contacts/${contactId}/opportunity`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { card: PipelineCard | null; stages: Stage[]; recurrence?: CustomerType | null } | null) => {
        if (!active || !data) return;
        setCard(data.card);
        setStages(data.stages);
        onRecurrence?.(data.recurrence ?? null);
      })
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // onRecurrence muda a cada render do pai; a busca depende só do contato.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  const save = async (patch: { column?: string; autoMoveEnabled?: boolean }) => {
    if (!card) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/contacts/${contactId}/opportunity`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: card.id, ...patch }) });
      const data = (await response.json().catch(() => ({}))) as { card?: PipelineCard; error?: string };
      if (!response.ok || !data.card) throw new Error(data.error ?? "Não foi possível atualizar a oportunidade.");
      setCard(data.card);
      toast.success("Oportunidade atualizada", patch.column ? `Etapa: ${stages.find((stage) => stage.id === patch.column)?.titulo ?? patch.column}` : data.card.autoMoveEnabled === false ? "Automação pausada neste card." : "Automação ligada neste card.");
    } catch (error) {
      toast.error("Erro", error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="rounded-xl border border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-700">Carregando oportunidade...</p>;
  if (!card) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <Target className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Sem oportunidade no funil. Ela é criada sozinha quando o cliente envia receita, pede orçamento ou se interessa por um modelo.
      </div>
    );
  }

  const lastNote = card.observacoes?.find((note) => note.autor === "IA");
  return (
    <section aria-label="Oportunidade no funil de vendas" className="space-y-2.5 rounded-xl border border-[#002187]/15 bg-[#f5f8ff] p-3 dark:border-slate-700 dark:bg-[#051647]/60">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-[#051647] dark:text-white" title={card.titulo}>{card.titulo}</p>
        <p className="shrink-0 text-right">
          <span className="block text-sm font-extrabold text-[#051647] dark:text-white">{card.valor}</span>
          {card.estimatedValue && !card.valorFaturado ? <span className="block text-[10px] text-slate-500">estimado</span> : null}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
          Etapa
          <select
            value={card.coluna}
            disabled={!canWrite || saving}
            onChange={(event) => void save({ column: event.target.value })}
            className="h-8 min-w-0 flex-1 cursor-pointer rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-[#051647] dark:text-white"
          >
            {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.titulo}</option>)}
          </select>
        </label>
        <Link href="/" target="_blank" className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-xs font-semibold text-[#002187] hover:underline dark:text-[#C4D600]">
          Pipeline<ExternalLink className="h-3 w-3" aria-hidden />
        </Link>
      </div>
      {(card.receitaAnexada || card.lojaInteresse || card.autoMoveEnabled === false) && (
        <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
          {card.receitaAnexada && <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[#002187] dark:bg-slate-800 dark:text-slate-200"><FileText className="h-3 w-3" aria-hidden />Receita anexada</span>}
          {card.lojaInteresse && <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-[#F7915E]/15 px-2 py-0.5 text-[#9a3d12] dark:text-[#F7915E]"><MapPin className="h-3 w-3 shrink-0" aria-hidden />{card.lojaInteresse}</span>}
          {card.autoMoveEnabled === false && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Automação pausada</span>}
        </div>
      )}
      {lastNote && <p className="flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400"><Bot className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />{lastNote.texto.replace(/^🤖\s*/, "")}</p>}
      {canWrite && (
        <button type="button" disabled={saving} onClick={() => void save({ autoMoveEnabled: card.autoMoveEnabled === false })} className="cursor-pointer text-[11px] font-semibold text-slate-500 hover:text-[#002187] hover:underline disabled:cursor-not-allowed dark:text-slate-400 dark:hover:text-[#C4D600]">
          {card.autoMoveEnabled === false ? "Ligar movimentação automática" : "Pausar movimentação automática"}
        </button>
      )}
    </section>
  );
}
