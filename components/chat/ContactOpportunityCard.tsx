"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, ExternalLink, FileText, MapPin, Plus, Target } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { CUSTOMER_TYPE_COLOR, CUSTOMER_TYPE_LABEL, type CustomerType, type PipelineCard } from "@/lib/sales-pipeline";

type Stage = { id: string; titulo: string };

/**
 * Oportunidade do cliente no mesmo visual do card do Kanban do Pipeline (selos, título, valor e barra de progresso),
 * com seletor rápido de etapa, atalho para o Pipeline e "+ Criar oportunidade" quando ainda não há card.
 * Devolve a classificação Novo/Recorrente para o cabeçalho do modal.
 */
export function ContactOpportunityCard({ contactId, conversationId, canWrite, onRecurrence }: { contactId: string; conversationId?: string; canWrite: boolean; onRecurrence?: (type: CustomerType | null) => void }) {
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

  const create = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/contacts/${contactId}/opportunity`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId }) });
      const data = (await response.json().catch(() => ({}))) as { card?: PipelineCard; error?: string };
      if (!response.ok || !data.card) throw new Error(data.error ?? "Não foi possível criar a oportunidade.");
      setCard(data.card);
      if (data.card.customerType) onRecurrence?.(data.card.customerType);
      toast.success("Oportunidade criada", `Card aberto em ${stages.find((stage) => stage.id === data.card!.coluna)?.titulo ?? "Novo lead"}.`);
    } catch (error) {
      toast.error("Erro", error instanceof Error ? error.message : "Falha ao criar.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-40 animate-pulse rounded-xl border border-slate-200/80 bg-slate-50 dark:border-slate-700/80 dark:bg-white/5" aria-label="Carregando oportunidade" />;

  if (!card) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center dark:border-slate-700 dark:bg-[#07194f]">
        <Target className="h-6 w-6 text-slate-300 dark:text-slate-600" aria-hidden />
        <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">Este cliente ainda não tem oportunidade aberta no funil de vendas.</p>
        {canWrite && (
          <button type="button" disabled={saving} onClick={() => void create()} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-[#C4D600] px-3 text-xs font-semibold text-[#051647] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" />{saving ? "Criando..." : "Criar oportunidade"}
          </button>
        )}
      </div>
    );
  }

  const progress = Math.max(0, Math.min(100, card.progresso ?? 0));
  const lastNote = card.observacoes?.find((note) => note.autor === "IA");
  return (
    <article aria-label="Oportunidade no funil de vendas" className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-700/80 dark:bg-[#07194f]">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] font-bold">
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 ${card.customerType ? CUSTOMER_TYPE_COLOR[card.customerType] : card.tagColor}`}>{card.customerType ? CUSTOMER_TYPE_LABEL[card.customerType] : card.tag}</span>
        {card.receitaAnexada && <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#002187]/10 px-2 py-0.5 text-[#002187] dark:bg-[#002187]/40 dark:text-white"><FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Receita anexada</span>}
        {card.lojaInteresse && <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#F7915E]/15 px-2 py-0.5 text-[#9a3d12] dark:text-[#F7915E]" title={card.lojaInteresse}><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{card.lojaInteresse}</span></span>}
        {card.autoMoveEnabled === false && <span className="whitespace-nowrap rounded-full bg-slate-200 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Automação pausada</span>}
      </div>

      <div className="min-w-0">
        <h3 className="line-clamp-2 break-words text-sm font-bold leading-tight text-slate-900 dark:text-white" title={card.titulo}>{card.titulo}</h3>
        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400" title={card.cliente}>{card.cliente}</p>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <span className="min-w-0 truncate text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
            {card.valor}
            {card.estimatedValue && !card.valorFaturado ? <span className="ml-1 text-[10px] font-semibold text-slate-400">estimado</span> : null}
          </span>
          <span className="text-[11px] font-semibold text-slate-400">{progress}%</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className={`h-1.5 rounded-full ${card.progressoCor || "bg-[#C4D600]"}`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      {lastNote && <p className="flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400"><Bot className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />{lastNote.texto.replace(/^🤖\s*/, "")}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/80">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          Etapa
          <select
            value={card.coluna}
            disabled={!canWrite || saving}
            onChange={(event) => void save({ column: event.target.value })}
            className="h-8 min-w-0 max-w-[220px] flex-1 cursor-pointer rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-900 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-[#051647] dark:text-white"
          >
            {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.titulo}</option>)}
          </select>
        </label>
        <div className="flex shrink-0 items-center gap-3">
          {canWrite && (
            <button type="button" disabled={saving} onClick={() => void save({ autoMoveEnabled: card.autoMoveEnabled === false })} className="cursor-pointer text-[11px] font-semibold text-slate-500 hover:text-[#002187] hover:underline disabled:cursor-not-allowed dark:text-slate-400 dark:hover:text-[#C4D600]">
              {card.autoMoveEnabled === false ? "Ligar automação" : "Pausar automação"}
            </button>
          )}
          <Link href="/" target="_blank" className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-[#002187] hover:underline dark:text-[#C4D600]">
            Abrir no Pipeline<ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  );
}
