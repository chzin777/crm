"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Pause, Play, RotateCcw, XCircle } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/components/ToastProvider";
import { BULK_STARTED_EVENT, BulkJobDetailsDialog, type BulkJobView } from "@/components/BulkDispatchTracker";

type Operator = { id: string; name: string };
type Pricing = { marketing: number; utility: number; authentication: number };

/** Custo estimado do lote: destinatários × preço da categoria do modelo (mensagem livre não é cobrada). */
function estimatedCost(job: BulkJobView, pricing: Pricing | null) {
  if (!pricing || !job.templateName) return job.templateName ? null : 0;
  const category = (job.templateCategory ?? "").toUpperCase();
  const unit = category === "MARKETING" ? pricing.marketing : category === "UTILITY" ? pricing.utility : category === "AUTHENTICATION" ? pricing.authentication : null;
  return unit === null ? null : job.total * unit;
}
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type ListResponse = { data?: BulkJobView[]; isAdmin?: boolean; operators?: Operator[]; error?: string };

const POLL_MS = 3_000;

function displayStatus(job: BulkJobView) {
  if (job.status === "running") return { label: "Em andamento", className: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" };
  if (job.status === "paused") return { label: "Pausado", className: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" };
  if (job.status === "cancelled") return { label: "Cancelado", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
  if (job.sent === 0 && job.failed > 0) return { label: "Falhou", className: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300" };
  return { label: "Concluído", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" };
}

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

const actionClass = "inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

/** Lotes de envio em massa iniciados pelo pipeline; exibido na aba "Envios em massa" de /campanhas. */
export function BulkDispatchHistory() {
  const toast = useToast();
  const [jobs, setJobs] = useState<BulkJobView[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [operatorFilter, setOperatorFilter] = useState("");
  const [error, setError] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/metrics/pricing", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: Pricing } | null) => { if (!cancelled && body?.data) setPricing(body.data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);

  const load = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    try {
      const params = new URLSearchParams();
      if (operatorFilter) params.set("userId", operatorFilter);
      const response = await fetch(`/api/whatsapp/bulk-send?${params.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as ListResponse | null;
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível carregar os envios.");
      const list = body?.data ?? [];
      setJobs(list);
      setIsAdmin(body?.isAdmin ?? false);
      setOperators(body?.operators ?? []);
      setError("");
      // Atualiza sozinho enquanto houver lote enviando.
      if (list.some((job) => job.status === "running")) timerRef.current = setTimeout(() => void loadRef.current(), POLL_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os envios.");
      setJobs((current) => current ?? []);
    }
  }, [operatorFilter]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    void load();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load]);

  const runAction = async (job: BulkJobView, action: "pause" | "resume" | "cancel" | "retry") => {
    if (action === "cancel" && !window.confirm("Cancelar o envio para os contatos que ainda estão na fila?")) return;
    if (action === "retry" && !window.confirm(`Reenviar a mensagem para os ${job.failed} contato(s) que falharam?`)) return;
    setBusyId(job.id);
    try {
      const response = action === "retry"
        ? await fetch(`/api/whatsapp/bulk-send/${job.id}/retry`, { method: "POST" })
        : await fetch(`/api/whatsapp/bulk-send/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível concluir a ação.");
      const messages = { pause: "Pausa solicitada: o envio para antes do próximo contato.", resume: "Envio retomado.", cancel: "Envio cancelado para os contatos restantes.", retry: "Novo lote criado com os contatos que falharam." };
      toast.success("Envios em massa", messages[action]);
      if (action === "resume" || action === "retry") window.dispatchEvent(new Event(BULK_STARTED_EVENT));
      await load();
    } catch (err) {
      toast.error("Envios em massa", err instanceof Error ? err.message : "Não foi possível concluir a ação.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Envios em massa</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Lotes enviados pelo pipeline: andamento, histórico e falhas de cada contato</p>
        </div>
        {isAdmin && operators.length > 0 && (
          <select value={operatorFilter} onChange={(event) => setOperatorFilter(event.target.value)} className="h-10 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]">
            <option value="">Todos os operadores</option>
            {operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.name}</option>)}
          </select>
        )}
      </div>

      {error && <p role="alert" className="mb-4 text-sm font-medium text-[#9a3d12] dark:text-[#F7915E]">{error}</p>}

      {jobs === null ? (
        <div className="flex h-64 items-center justify-center"><LoadingSpinner label="Carregando envios..." /></div>
      ) : jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Nenhum envio em massa ainda. Inicie um pelo pipeline, no menu de uma etapa.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07194f]">
          <table className="w-full min-w-[1060px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3">Criado por</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Progresso</th>
                <th className="px-4 py-3">Custo est.</th>
                <th className="px-4 py-3">Início / término</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {jobs.map((job) => {
                const status = displayStatus(job);
                const done = job.sent + job.failed;
                const percent = job.total > 0 ? Math.round((done / job.total) * 100) : 0;
                const busy = busyId === job.id;
                const finished = job.status === "completed" || job.status === "cancelled";
                return (
                  <tr key={job.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 dark:text-white">Etapa {job.stageName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{job.templateName ? `Modelo: ${job.templateName}` : "Mensagem livre"}</p>
                      {job.retryOf && <p className="text-[11px] text-slate-400">Reenvio de falhas</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{job.userName || "—"}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${status.className}`}>{status.label}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-[#002187] transition-all duration-300 dark:bg-[#C4D600]" style={{ width: `${percent}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{percent}%</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Total {job.total} · <span className="text-emerald-700 dark:text-emerald-300">{job.sent} enviados</span> · <span className="text-red-600 dark:text-red-400">{job.failed} falhas</span> · {job.pending} na fila
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-200">
                      {(() => {
                        const cost = estimatedCost(job, pricing);
                        return cost === null ? "—" : cost === 0 && !job.templateName ? <span className="text-slate-400">Sem custo</span> : <span className="font-semibold">{brl(cost)}</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                      <p>{formatDate(job.createdAt)}</p>
                      <p className="text-slate-400">{finished ? formatDate(job.finishedAt) : "em curso"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button type="button" onClick={() => setDetailsId(job.id)} className={actionClass}><Eye className="h-3.5 w-3.5" />Ver detalhes</button>
                        {job.status === "running" && <button type="button" disabled={busy} onClick={() => void runAction(job, "pause")} className={actionClass}><Pause className="h-3.5 w-3.5" />Pausar</button>}
                        {job.status === "paused" && <button type="button" disabled={busy} onClick={() => void runAction(job, "resume")} className={actionClass}><Play className="h-3.5 w-3.5" />Retomar</button>}
                        {(job.status === "running" || job.status === "paused") && <button type="button" disabled={busy} onClick={() => void runAction(job, "cancel")} className={`${actionClass} text-red-600 dark:text-red-400`}><XCircle className="h-3.5 w-3.5" />Cancelar</button>}
                        {finished && job.failed > 0 && <button type="button" disabled={busy} onClick={() => void runAction(job, "retry")} className={actionClass}><RotateCcw className="h-3.5 w-3.5" />Reenviar falhas</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detailsId && <BulkJobDetailsDialog jobId={detailsId} onClose={() => setDetailsId(null)} />}
    </div>
  );
}
