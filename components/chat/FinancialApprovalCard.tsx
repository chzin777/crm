"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import type { InstallmentsSummary } from "@/lib/ai/installments";

type Approval = {
  id: string;
  customerNameVmset: string | null;
  customerCpfMasked: string | null;
  installmentsSummary: InstallmentsSummary | null;
  draftMessage: string;
  transcribedText: string | null;
  heardName: string | null;
  nameMatches: boolean;
  createdAt: string;
};

const brl = (value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const brDate = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "-");

/**
 * Trava de aprovação humana das parcelas do crediário: o que o cliente pediu x cadastro achado no VMSet,
 * rascunho editável e as ações Confirmar e Enviar / Corrigir CPF / Assumir Manualmente.
 */
export function FinancialApprovalCard({ conversationId, tick, canWrite, onChanged }: { conversationId: string; tick: number; canWrite: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [approval, setApproval] = useState<Approval | null>(null);
  const [draft, setDraft] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [cpf, setCpf] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"" | "approve" | "reconsult" | "reject">("");

  useEffect(() => {
    let active = true;
    fetch(`/api/chat/conversations/${conversationId}/ai-approval`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { approval: Approval | null } | null) => {
        if (!active || !data) return;
        setApproval((current) => {
          // Mantém o texto que o operador está editando enquanto a mesma aprovação continua pendente.
          if (!data.approval || current?.id !== data.approval.id || current.draftMessage !== data.approval.draftMessage) setDraft(data.approval?.draftMessage ?? "");
          return data.approval;
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [conversationId, tick]);

  if (!approval) return null;
  const summary = approval.installmentsSummary;

  const call = async (kind: "approve" | "reconsult" | "reject", body: Record<string, unknown>) => {
    setBusy(kind);
    try {
      const response = await fetch(`/api/chat/conversations/${conversationId}/ai-approval/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionId: approval.id, ...body }) });
      const data = (await response.json().catch(() => ({}))) as { error?: string; approval?: Approval };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir.");
      if (kind === "reconsult" && data.approval) {
        setApproval(data.approval);
        setDraft(data.approval.draftMessage);
        setCorrecting(false);
        toast.success("Cadastro reconsultado no VMSet");
      } else {
        setApproval(null);
        toast.success(kind === "approve" ? "Parcelas enviadas ao cliente" : "Você assumiu o atendimento");
        onChanged();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na ação.");
    } finally {
      setBusy("");
    }
  };

  return (
    <section aria-label="Aprovação financeira pendente" className="mx-3 mb-2 space-y-2 rounded-xl border-2 border-[#F7915E]/60 bg-[#fff8f3] p-3 text-xs text-slate-700 shadow-sm dark:border-[#F7915E]/50 dark:bg-[#07194f] dark:text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-[#F7915E]/20 px-2 py-0.5 text-[11px] font-bold text-[#9a3d12] dark:text-[#F7915E]">⏳ Aprovação Financeira</span>
        <span className="text-[10px] text-slate-500">Nada foi enviado ao cliente ainda</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-white p-2 dark:bg-[#051647]">
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">O cliente pediu</p>
          <p className="line-clamp-4 whitespace-pre-line">{approval.transcribedText || "-"}</p>
          {approval.heardName && <p className="mt-1 text-[11px]"><span className="font-semibold">Nome informado:</span> {approval.heardName}</p>}
        </div>
        <div className="rounded-lg bg-white p-2 dark:bg-[#051647]">
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Cadastro encontrado no VMSet</p>
          <p className="font-semibold text-[#051647] dark:text-white">{approval.customerNameVmset ?? "Sem nome"}</p>
          <p>CPF {approval.customerCpfMasked}</p>
          {summary && (
            <p className="mt-1">
              {summary.abertas} em aberto{summary.atrasadas ? ` (${summary.atrasadas} vencidas)` : ""} · {summary.pagas} pagas · {brl(summary.valorAberto)}
              {summary.proximoVencimento ? ` · próx. ${brDate(summary.proximoVencimento)} (${brl(summary.proximoValor ?? 0)})` : ""}
            </p>
          )}
        </div>
      </div>
      {!approval.nameMatches && (
        <p className="flex items-center gap-1 font-semibold text-[#9a3d12] dark:text-[#F7915E]"><AlertTriangle className="h-3.5 w-3.5" aria-hidden />O nome informado não confere com o cadastro. Confira antes de enviar.</p>
      )}
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Resposta pronta da IA (editável)</span>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={5} disabled={!canWrite || !!busy} className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-[#051647] dark:text-white" />
      </label>
      {correcting && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1">
            <span className="text-[10px] font-semibold text-slate-500">CPF correto</span>
            <input value={cpf} onChange={(event) => setCpf(event.target.value)} inputMode="numeric" placeholder="000.000.000-00" className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-[#051647]" />
          </label>
          <label className="flex-1">
            <span className="text-[10px] font-semibold text-slate-500">Nome completo (opcional)</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-[#051647]" />
          </label>
          <button type="button" disabled={!!busy || cpf.replace(/\D/g, "").length !== 11} onClick={() => void call("reconsult", { cpf, name })} className="cursor-pointer rounded-lg bg-[#002187] px-3 py-1.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {busy === "reconsult" ? "Consultando..." : "Reconsultar VMSet"}
          </button>
        </div>
      )}
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy || !draft.trim()} onClick={() => void call("approve", { message: draft })} className="cursor-pointer rounded-lg bg-[#C4D600] px-3 py-1.5 font-bold text-[#051647] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
            {busy === "approve" ? "Enviando..." : "✅ Confirmar e Enviar"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => setCorrecting((value) => !value)} className="cursor-pointer rounded-lg border border-[#002187] px-3 py-1.5 font-semibold text-[#002187] disabled:cursor-not-allowed dark:border-[#C4D600] dark:text-[#C4D600]">
            🔄 Corrigir CPF
          </button>
          <button type="button" disabled={!!busy} onClick={() => void call("reject", {})} className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 disabled:cursor-not-allowed dark:border-slate-600 dark:text-slate-200">
            {busy === "reject" ? "Assumindo..." : "❌ Assumir Manualmente"}
          </button>
        </div>
      )}
    </section>
  );
}
