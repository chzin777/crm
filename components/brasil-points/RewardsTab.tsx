"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Gift, PackageCheck, Pencil, Plus, X } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/components/ToastProvider";
import { SegmentedControl, cardClass } from "@/components/dashboard/DashboardKit";
import { api, ghostButton, inputClass, labelClass, primaryButton } from "@/components/brasil-points/shared";

type Reward = { id: string; title: string; description: string; imageUrl: string | null; pointsCost: number; stockQuantity: number | null; isActive: boolean };
type Redemption = { id: string; userName: string; rewardTitle: string; pointsSpent: number; status: string; adminNotes: string | null; reviewedBy: string | null; createdAt: string };
type Draft = { id?: string; title: string; description: string; imageUrl: string; pointsCost: string; stock: string; isActive: boolean };
type Queue = "open" | "delivered" | "rejected";

const EMPTY: Draft = { title: "", description: "", imageUrl: "", pointsCost: "", stock: "", isActive: true };
const STATUS: Record<string, string> = { pending: "Aguardando", approved: "Aprovado", delivered: "Entregue", rejected: "Recusado" };
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Premiações & resgates: catálogo de prêmios e fila de aprovação/entrega (recusa devolve os pontos). */
export function RewardsTab() {
  const toast = useToast();
  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [queue, setQueue] = useState<Queue>("open");
  const [redemptions, setRedemptions] = useState<Redemption[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rejecting, setRejecting] = useState<Redemption | null>(null);
  const [notes, setNotes] = useState("");

  const loadRewards = useCallback(() => api<Reward[]>("/api/brasil-points/rewards").then(setRewards).catch((error: Error) => toast.error("Prêmios", error.message)), [toast]);
  const loadQueue = useCallback(() => {
    const query = queue === "open" ? "" : `?status=${queue}`;
    return api<Redemption[]>(`/api/brasil-points/redemptions${query}`).then(setRedemptions).catch((error: Error) => toast.error("Resgates", error.message));
  }, [queue, toast]);
  useEffect(() => {
    void loadRewards();
  }, [loadRewards]);
  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const saveReward = async () => {
    if (!draft) return;
    try {
      const body = { title: draft.title, description: draft.description, imageUrl: draft.imageUrl.trim() || null, pointsCost: Number(draft.pointsCost), stockQuantity: draft.stock.trim() === "" ? null : Number(draft.stock), isActive: draft.isActive };
      await api(draft.id ? `/api/brasil-points/rewards/${draft.id}` : "/api/brasil-points/rewards", { method: draft.id ? "PUT" : "POST", body: JSON.stringify(body) });
      toast.success(draft.id ? "Prêmio atualizado" : "Prêmio criado");
      setDraft(null);
      void loadRewards();
    } catch (error) {
      toast.error("Prêmio não salvo", (error as Error).message);
    }
  };

  const review = async (item: Redemption, status: "approved" | "delivered" | "rejected", reason?: string) => {
    try {
      await api(`/api/brasil-points/redemptions/${item.id}`, { method: "PUT", body: JSON.stringify({ status, notes: reason ?? null }) });
      toast.success(status === "rejected" ? "Resgate recusado" : status === "approved" ? "Resgate aprovado" : "Marcado como entregue", status === "rejected" ? `${item.pointsSpent} pontos devolvidos a ${item.userName}.` : undefined);
      setRejecting(null);
      setNotes("");
      void loadQueue();
      void loadRewards();
    } catch (error) {
      toast.error("Não foi possível concluir", (error as Error).message);
    }
  };

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <section className={`${cardClass} min-w-0 overflow-hidden`}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/10">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#051647] dark:text-white"><Gift className="h-4 w-4 text-[#F7915E]" />Prêmios e benefícios</h2>
          <button type="button" onClick={() => setDraft({ ...EMPTY })} className={primaryButton}><Plus className="h-4 w-4" />Novo prêmio</button>
        </div>
        {!rewards ? <div className="flex justify-center py-10"><LoadingSpinner label="Carregando..." size={28} /></div> : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {rewards.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-400">Cadastre folgas, vale-compras, PIX/bônus ou brindes.</li>}
            {rewards.map((reward) => (
              <li key={reward.id} className="flex min-w-0 items-center gap-3 px-4 py-3">
                {reward.imageUrl ? <img src={reward.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" /> : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600]"><Gift className="h-5 w-5" /></span>}
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-slate-800 dark:text-slate-100">{reward.title}{!reward.isActive && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-white/10">Desligado</span>}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{reward.pointsCost.toLocaleString("pt-BR")} pontos · {reward.stockQuantity === null ? "estoque ilimitado" : `${reward.stockQuantity} em estoque`}</p>
                </div>
                <button type="button" onClick={() => setDraft({ id: reward.id, title: reward.title, description: reward.description, imageUrl: reward.imageUrl ?? "", pointsCost: String(reward.pointsCost), stock: reward.stockQuantity === null ? "" : String(reward.stockQuantity), isActive: reward.isActive })} className={ghostButton} aria-label="Editar prêmio"><Pencil className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${cardClass} min-w-0 overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/10">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#051647] dark:text-white"><PackageCheck className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" />Resgates</h2>
          <SegmentedControl<Queue> label="Fila" value={queue} onChange={setQueue} options={[{ value: "open", label: "Em aberto" }, { value: "delivered", label: "Entregues" }, { value: "rejected", label: "Recusados" }]} />
        </div>
        {!redemptions ? <div className="flex justify-center py-10"><LoadingSpinner label="Carregando..." size={28} /></div> : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {redemptions.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-400">Nenhum resgate aqui.</li>}
            {redemptions.map((item) => (
              <li key={item.id} className="flex min-w-0 flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-slate-800 dark:text-slate-100">{item.rewardTitle}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.userName} · {item.pointsSpent.toLocaleString("pt-BR")} pontos · {when(item.createdAt)} · <span className="font-semibold">{STATUS[item.status] ?? item.status}</span></p>
                  {item.adminNotes && <p className="break-words text-xs text-slate-400">{item.adminNotes}</p>}
                </div>
                {(item.status === "pending" || item.status === "approved") && (
                  <div className="flex shrink-0 gap-1.5">
                    {item.status === "pending" && <button type="button" onClick={() => void review(item, "approved")} className={ghostButton}><Check className="h-3.5 w-3.5" />Aprovar</button>}
                    <button type="button" onClick={() => void review(item, "delivered")} className={ghostButton}><PackageCheck className="h-3.5 w-3.5" />Entregue</button>
                    <button type="button" onClick={() => setRejecting(item)} className={ghostButton}><X className="h-3.5 w-3.5" />Recusar</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {draft && (
        <EntityDialog titleId="bp-reward" title={draft.id ? "Editar prêmio" : "Novo prêmio"} description="Folga, vale-compras, PIX/bônus ou brinde. O custo vale para resgates novos." onClose={() => setDraft(null)} size="sm">
          <form onSubmit={(event) => { event.preventDefault(); void saveReward(); }} className="space-y-3">
            <label className="block space-y-1"><span className={labelClass}>Título</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ex.: Folga de 1 dia" className={inputClass} required /></label>
            <label className="block space-y-1"><span className={labelClass}>Descrição</span><textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} className={`${inputClass} h-auto py-2`} /></label>
            <label className="block space-y-1"><span className={labelClass}>Imagem (URL, opcional)</span><input type="url" value={draft.imageUrl} onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })} className={inputClass} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1"><span className={labelClass}>Custo em pontos</span><input inputMode="numeric" value={draft.pointsCost} onChange={(e) => setDraft({ ...draft, pointsCost: e.target.value.replace(/[^\d]/g, "") })} className={inputClass} required /></label>
              <label className="block space-y-1"><span className={labelClass}>Estoque (vazio = ilimitado)</span><input inputMode="numeric" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value.replace(/[^\d]/g, "") })} className={inputClass} /></label>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} className="h-4 w-4 cursor-pointer" />Disponível no app</label>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setDraft(null)} className={ghostButton}>Cancelar</button><button type="submit" className={primaryButton}>Salvar prêmio</button></div>
          </form>
        </EntityDialog>
      )}

      {rejecting && (
        <EntityDialog titleId="bp-reject" title="Recusar resgate" description={`${rejecting.userName} recebe de volta ${rejecting.pointsSpent} pontos.`} onClose={() => setRejecting(null)} size="sm">
          <form onSubmit={(event) => { event.preventDefault(); if (notes.trim()) void review(rejecting, "rejected", notes.trim()); }} className="space-y-3">
            <label className="block space-y-1"><span className={labelClass}>Motivo (o vendedor vê no app)</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputClass} h-auto py-2`} required /></label>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setRejecting(null)} className={ghostButton}>Cancelar</button><button type="submit" className={primaryButton}>Recusar e devolver pontos</button></div>
          </form>
        </EntityDialog>
      )}
    </div>
  );
}
