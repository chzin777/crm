"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, FileText, MapPin, Target } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { CUSTOMER_TYPE_COLOR, CUSTOMER_TYPE_LABEL, type PipelineCard } from "@/lib/sales-pipeline";

type Stage = { id: string; titulo: string };

/** Oportunidade ativa do cliente no funil de vendas, com seletor rápido de etapa (movimento manual registrado no card). */
export function ContactOpportunityCard({ contactId, canWrite }: { contactId: string; canWrite: boolean }) {
  const toast = useToast();
  const [card, setCard] = useState<PipelineCard | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/contacts/${contactId}/opportunity`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { card: PipelineCard | null; stages: Stage[] } | null) => {
        if (!active || !data) return;
        setCard(data.card);
        setStages(data.stages);
      })
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
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
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <Target className="h-4 w-4 shrink-0" aria-hidden />
        Sem oportunidade no funil. Ela é criada sozinha quando o cliente envia receita, pede orçamento ou se interessa por um modelo.
      </div>
    );
  }

  const type = card.customerType;
  const lastNote = card.observacoes?.find((note) => note.autor === "IA");
  return (
    <section aria-label="Oportunidade no funil de vendas" className="space-y-3 rounded-xl border border-[#002187]/20 bg-[#f5f8ff] p-3 dark:border-slate-700 dark:bg-[#07194f]/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Target className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" aria-hidden />
          <span className="truncate text-sm font-semibold text-[#051647] dark:text-white">{card.titulo}</span>
        </div>
        <span className="text-sm font-extrabold text-[#051647] dark:text-white">{card.valor}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
        {type && <span className={`rounded-full px-2 py-0.5 ${CUSTOMER_TYPE_COLOR[type]}`}>{CUSTOMER_TYPE_LABEL[type]}</span>}
        {card.receitaAnexada && <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[#002187] dark:bg-slate-800 dark:text-slate-200"><FileText className="h-3 w-3" aria-hidden />Receita anexada</span>}
        {card.lojaInteresse && <span className="inline-flex items-center gap-1 rounded-full bg-[#F7915E]/15 px-2 py-0.5 text-[#9a3d12] dark:text-[#F7915E]"><MapPin className="h-3 w-3" aria-hidden />{card.lojaInteresse}</span>}
        {card.autoMoveEnabled === false && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Automação pausada</span>}
      </div>
      {card.ultimaCompraResumo && <p className="text-xs text-slate-600 dark:text-slate-300">Última compra: {card.ultimaCompraResumo}</p>}
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
        Etapa
        <select
          value={card.coluna}
          disabled={!canWrite || saving}
          onChange={(event) => void save({ column: event.target.value })}
          className="mt-1 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-[#051647] dark:text-white"
        >
          {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.titulo}</option>)}
        </select>
      </label>
      {lastNote && <p className="flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400"><Bot className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />{lastNote.texto.replace(/^🤖\s*/, "")}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {canWrite && (
          <button type="button" disabled={saving} onClick={() => void save({ autoMoveEnabled: card.autoMoveEnabled === false })} className="cursor-pointer text-xs font-semibold text-[#002187] hover:underline disabled:cursor-not-allowed dark:text-[#C4D600]">
            {card.autoMoveEnabled === false ? "Ligar movimentação automática" : "Pausar movimentação automática"}
          </button>
        )}
        <Link href="/" className="cursor-pointer text-xs font-semibold text-[#002187] hover:underline dark:text-[#C4D600]">Abrir no pipeline</Link>
      </div>
    </section>
  );
}
