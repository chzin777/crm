"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Send, X } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { CampaignMetricsPanel } from "@/components/CampaignMetricsPanel";
import { useToast } from "@/components/ToastProvider";
import type { BulkItemStatus, BulkJobView } from "@/lib/bulk-dispatch";

export type { BulkJobView };

/** Avisa o indicador global que um lote acabou de começar (acelera a atualização). */
export const BULK_STARTED_EVENT = "bulk-dispatch:started";
const POLL_MS = 3_000;
const DETAILS_POLL_MS = 1_500;
const NOTIFIED_KEY = "bulk-dispatch:notified";
const DISMISSED_KEY = "bulk-dispatch:dismissed";

function readSet(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set<string>();
  }
}

function writeSet(key: string, value: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...value].slice(-100)));
  } catch {
    // Sem armazenamento local: o aviso pode repetir, sem outro efeito.
  }
}

const STATUS_LABEL: Record<BulkItemStatus, string> = { PENDING: "Na fila", SENDING: "Enviando", SENT: "Enviado", FAILED: "Falhou", CANCELLED: "Cancelado" };
const STATUS_CLASS: Record<BulkItemStatus, string> = {
  SENT: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  FAILED: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  SENDING: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  PENDING: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  CANCELLED: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

const JOB_HEADLINE: Record<BulkJobView["status"], string> = {
  running: "Enviando com pausa entre as mensagens...",
  paused: "Envio pausado",
  completed: "Envio concluído",
  cancelled: "Envio cancelado",
};

/** Barra de progresso + lista de destinatários com o status de cada um. */
export function BulkJobProgress({ job }: { job: BulkJobView }) {
  const done = job.sent + job.failed;
  const percent = job.total > 0 ? Math.round((done / job.total) * 100) : 0;
  const isFinished = job.status === "completed" || job.status === "cancelled";
  const items = job.items ?? [];
  const failures = items.filter((item) => item.status === "FAILED");
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>{JOB_HEADLINE[job.status]}</span>
          <span>{done} de {job.total} · {percent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-[#051647] transition-all duration-300 dark:bg-[#C4D600]" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-xs font-semibold text-slate-900 dark:text-white">
          {job.sent} enviados{job.failed > 0 && <span className="text-red-600 dark:text-red-400"> · {job.failed} falharam</span>}
          {job.pending > 0 && <span className="font-normal text-slate-500 dark:text-slate-400"> · {job.pending} na fila</span>}
        </p>
      </div>
      <div className="max-h-[280px] space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
        {items.map((item) => (
          <div key={item.contactId} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900 dark:text-white">{item.nome}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">{item.telefone}</p>
              {item.error && <p className="text-[10px] text-red-600 dark:text-red-400">{item.error}</p>}
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CLASS[item.status]}`}>{STATUS_LABEL[item.status]}</span>
          </div>
        ))}
      </div>
      {failures.length > 0 && isFinished && (
        <div className="rounded-lg border border-red-100 bg-red-50/50 p-3 dark:border-red-900/30 dark:bg-red-900/10">
          <p className="text-[10px] font-semibold text-red-700 dark:text-red-300">Detalhes das falhas:</p>
          {failures.map((item) => <p key={item.contactId} className="mt-1 text-[10px] text-red-600 dark:text-red-400">• {item.nome}: {item.error ?? "Erro desconhecido"}</p>)}
        </div>
      )}
    </div>
  );
}

/** Modal com a lista completa do lote; atualiza sozinho enquanto o lote não termina. */
export function BulkJobDetailsDialog({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [job, setJob] = useState<BulkJobView | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"destinatarios" | "resultados">("destinatarios");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fetchJob = async () => {
      try {
        const response = await fetch(`/api/whatsapp/bulk-send/${jobId}?t=${Date.now()}`, { cache: "no-store" });
        const body = await response.json().catch(() => null) as { data?: BulkJobView; error?: string } | null;
        if (cancelled) return;
        if (!response.ok || !body?.data) {
          setError(body?.error ?? "Não foi possível carregar o envio.");
          // Falha passageira não congela a tela: tenta de novo, exceto se o lote não existe.
          if (response.status !== 404 && response.status !== 401) timer = setTimeout(fetchJob, DETAILS_POLL_MS);
          return;
        }
        setError("");
        setJob(body.data);
        if (body.data.status === "running") timer = setTimeout(fetchJob, DETAILS_POLL_MS);
      } catch {
        if (!cancelled) timer = setTimeout(fetchJob, DETAILS_POLL_MS);
      }
    };
    void fetchJob();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  return (
    <EntityDialog titleId="bulk-dispatch-details" title={`Envio em massa: ${job?.stageName ?? ""}`} description="Quem já recebeu, quem está na fila e quem falhou." onClose={onClose} size="lg">
      <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {([["destinatarios", "Destinatários"], ["resultados", "Resultados e vendas"]] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${tab === key ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700"}`}>{label}</button>
        ))}
      </div>
      {tab === "resultados" ? (
        <CampaignMetricsPanel type="bulk" id={jobId} />
      ) : job ? <>{error && <p role="status" className="mb-3 rounded-lg bg-[#F7915E]/10 p-2 text-xs text-[#9a3d12] dark:text-[#F7915E]">Não foi possível atualizar ({error}). Tentando de novo...</p>}<BulkJobProgress job={job} /></> : error ?<p className="text-sm text-red-600 dark:text-red-400">{error}</p> : <LoadingSpinner label="Carregando envio..." className="w-full justify-center py-8" />}
    </EntityDialog>
  );
}

/** Indicador flutuante dos envios em massa: visível em qualquer página até o lote terminar. */
export function BulkDispatchTracker() {
  const toast = useToast();
  const [jobs, setJobs] = useState<BulkJobView[]>([]);
  // Só é lido na tela depois que os lotes chegam do servidor, então não afeta a hidratação.
  const [dismissed, setDismissed] = useState<Set<string>>(() => (typeof window === "undefined" ? new Set() : readSet(DISMISSED_KEY)));
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);

  const load = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    let list: BulkJobView[] = [];
    try {
      const response = await fetch("/api/whatsapp/bulk-send?recent=1", { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json() as { data?: BulkJobView[] };
      list = body.data ?? [];
    } catch {
      // Falha de rede: tenta de novo no próximo ciclo se houver lote ativo.
      list = [];
    }
    setJobs(list);

    const notified = readSet(NOTIFIED_KEY);
    let changed = false;
    for (const job of list) {
      if (job.status === "completed" && !notified.has(job.id)) {
        notified.add(job.id);
        changed = true;
        if (job.sent > 0) toast.success("Envio em massa concluído", `${job.sent} sucesso(s)${job.failed > 0 ? ` · ${job.failed} falha(s)` : ""} · etapa ${job.stageName}`);
        else toast.error("Envio em massa concluído com falhas", `${job.failed} falha(s) · etapa ${job.stageName}`);
      }
    }
    if (changed) writeSet(NOTIFIED_KEY, notified);

    const hasRunning = list.some((job) => job.status === "running");
    if (hasRunning) timerRef.current = setTimeout(() => void loadRef.current(), POLL_MS);
  }, [toast]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    void load();
    const onStarted = () => {
      setCollapsed(false);
      void load();
    };
    window.addEventListener(BULK_STARTED_EVENT, onStarted);
    return () => {
      window.removeEventListener(BULK_STARTED_EVENT, onStarted);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load]);

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    writeSet(DISMISSED_KEY, next);
  };

  const visible = jobs.filter((job) => job.status === "running" || job.status === "paused" || !dismissed.has(job.id));
  // Sem lotes não há nada a mostrar; com lotes já estamos no navegador (vieram do fetch).
  if (visible.length === 0 && !detailsId) return null;

  return createPortal(
    <>
      {visible.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[90] w-[min(340px,calc(100vw-32px))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-[#07194f]">
          <button type="button" onClick={() => setCollapsed((value) => !value)} className="flex w-full items-center justify-between gap-2 bg-[#051647] px-3 py-2 text-left text-xs font-semibold text-white cursor-pointer">
            <span className="flex items-center gap-1.5"><Send className="h-3.5 w-3.5 text-[#C4D600]" />Envios em massa</span>
            {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {!collapsed && (
            <div className="max-h-[50vh] space-y-3 overflow-y-auto p-3">
              {visible.map((job) => {
                const done = job.sent + job.failed;
                const percent = job.total > 0 ? Math.round((done / job.total) * 100) : 0;
                const running = job.status === "running" || job.status === "paused";
                const headline = job.status === "running"
                  ? `Envio em massa em andamento (${job.sent} de ${job.total} enviados)`
                  : job.status === "paused"
                    ? `Envio pausado (${job.sent} de ${job.total} enviados)`
                    : `${job.status === "cancelled" ? "Envio cancelado" : "Envio concluído"}: ${job.sent} sucesso(s), ${job.failed} falha(s)`;
                return (
                  <div key={job.id} className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">{headline}</p>
                      {!running && (
                        <button type="button" onClick={() => dismiss(job.id)} aria-label="Dispensar" className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"><X className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Etapa {job.stageName}{job.failed > 0 && running ? ` · ${job.failed} falha(s)` : ""}</p>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className={`h-full rounded-full transition-all duration-300 ${running ? "bg-[#002187] dark:bg-[#C4D600]" : job.failed > 0 ? "bg-[#F7915E]" : "bg-emerald-500"}`} style={{ width: `${percent}%` }} />
                      </div>
                      <span className="w-9 text-right text-[10px] font-semibold text-slate-600 dark:text-slate-300">{percent}%</span>
                    </div>
                    <button type="button" onClick={() => setDetailsId(job.id)} className="text-[11px] font-semibold text-[#002187] hover:underline dark:text-[#C4D600] cursor-pointer">Ver detalhes</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {detailsId && <BulkJobDetailsDialog jobId={detailsId} onClose={() => setDetailsId(null)} />}
    </>,
    document.body,
  );
}
