"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, BarChart3, CheckCircle2, ChevronDown, ChevronUp, Clock3, Loader2, Send, Users, X } from "lucide-react";
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
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "?";

function StatusBadge({ status, error }: { status: BulkItemStatus; error?: string }) {
  const base = `inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CLASS[status]}`;
  if (status === "SENDING") return <span className={base}><Loader2 className="h-3 w-3 animate-spin" />Enviando</span>;
  if (status === "PENDING") return <span className={base}><Clock3 className="h-3 w-3" />Na fila</span>;
  if (status === "SENT") return <span className={`${base} soft-pop-in`}><CheckCircle2 className="h-3 w-3" />Enviado</span>;
  if (status === "FAILED") return <span className={`${base} soft-pop-in cursor-help`} title={error ?? "Erro desconhecido"}><AlertCircle className="h-3 w-3" />Falhou</span>;
  return <span className={base}><X className="h-3 w-3" />Cancelado</span>;
}

function MetricTile({ label, value, tone }: { label: string; value: number; tone: "neutral" | "success" | "danger" | "muted" }) {
  const tones = {
    neutral: "border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900/40 dark:text-white",
    success: "border-emerald-200/70 bg-emerald-50/60 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/15 dark:text-emerald-300",
    danger: "border-[#F7915E]/40 bg-[#F7915E]/10 text-[#9a3d12] dark:text-[#F7915E]",
    muted: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300",
  };
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${tones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value.toLocaleString("pt-BR")}</p>
    </div>
  );
}

/** Barra de progresso, contadores e lista de destinatários com o status de cada um (atualiza ao vivo). */
export function BulkJobProgress({ job }: { job: BulkJobView }) {
  const done = job.sent + job.failed;
  const percent = job.total > 0 ? Math.round((done / job.total) * 100) : 0;
  const isFinished = job.status === "completed" || job.status === "cancelled";
  const items = job.items ?? [];
  return (
    <div className="space-y-4">
      {isFinished && (
        <div className={`soft-pop-in flex items-center gap-3 rounded-xl border p-3 ${job.status === "cancelled" ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50" : job.failed > 0 ? "border-[#F7915E]/40 bg-[#F7915E]/10" : "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20"}`}>
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${job.status === "cancelled" ? "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200" : job.failed > 0 ? "bg-[#F7915E]/20 text-[#9a3d12] dark:text-[#F7915E]" : "bg-emerald-500 text-white"}`}>
            {job.status === "cancelled" ? <X className="h-4 w-4" /> : job.failed > 0 ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {job.status === "cancelled" ? "Envio cancelado" : job.failed > 0 ? "Envio concluído com falhas" : "Envio concluído!"}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {job.sent} mensagem(ns) enviada(s){job.failed > 0 ? ` · ${job.failed} falha(s): passe o mouse no status para ver o motivo` : ""}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricTile label="Total" value={job.total} tone="neutral" />
        <MetricTile label="Enviados" value={job.sent} tone="success" />
        <MetricTile label="Falhas" value={job.failed} tone={job.failed > 0 ? "danger" : "muted"} />
        <MetricTile label="Na fila" value={job.pending} tone="muted" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span className="flex items-center gap-1.5">
            {job.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#002187] dark:text-[#C4D600]" />}
            {JOB_HEADLINE[job.status]}
          </span>
          <span className="tabular-nums">{done} de {job.total} · {percent}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className={`h-full rounded-full transition-all duration-300 ease-out ${isFinished && job.failed === 0 && job.status !== "cancelled" ? "bg-emerald-500" : "bg-gradient-to-r from-[#002187] to-[#2a4fd6] dark:from-[#C4D600] dark:to-[#9fb000]"}`} style={{ width: `${percent}%` }} />
        </div>
      </div>

      <ul className="custom-scrollbar max-h-[300px] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
        {items.map((item) => (
          <li key={item.contactId} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#002187]/10 text-[11px] font-bold text-[#002187] dark:bg-[#C4D600]/15 dark:text-[#C4D600]">{initials(item.nome)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{item.nome}</p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{item.telefone}</p>
              {item.error && item.status === "FAILED" && <p className="mt-0.5 line-clamp-2 text-[11px] text-[#9a3d12] dark:text-[#F7915E]">{item.error}</p>}
            </div>
            <StatusBadge status={item.status} error={item.error} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export type BulkResultTab = "destinatarios" | "resultados";

/** Alternância entre a lista de envio e os resultados (funil e vendas), no mesmo estilo do modal de envio. */
export function BulkResultTabs({ tab, onChange, firstLabel = "Destinatários" }: { tab: BulkResultTab; onChange: (tab: BulkResultTab) => void; firstLabel?: string }) {
  const tabs = [
    { key: "destinatarios" as const, label: firstLabel, icon: Users },
    { key: "resultados" as const, label: "Resultados e vendas", icon: BarChart3 },
  ];
  return (
    <div role="tablist" aria-label="Visualização do envio" className="flex shrink-0 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/50">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={tab === key}
          onClick={() => onChange(key)}
          className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${tab === key ? "bg-white text-[#051647] shadow-sm ring-1 ring-slate-200 dark:bg-[#C4D600] dark:text-[#051647] dark:ring-0" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
        >
          <Icon className="h-3.5 w-3.5" />{label}
        </button>
      ))}
    </div>
  );
}

/** Modal com a lista completa do lote; atualiza sozinho enquanto o lote não termina. */
export function BulkJobDetailsDialog({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [job, setJob] = useState<BulkJobView | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<BulkResultTab>("destinatarios");

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
      <div className="flex h-full min-h-0 flex-col gap-4">
        <BulkResultTabs tab={tab} onChange={setTab} />
        <div key={tab} className="soft-pop-in custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
          {tab === "resultados" ? (
            <CampaignMetricsPanel type="bulk" id={jobId} />
          ) : job ? <>{error && <p role="status" className="mb-3 rounded-lg bg-[#F7915E]/10 p-2 text-xs text-[#9a3d12] dark:text-[#F7915E]">Não foi possível atualizar ({error}). Tentando de novo...</p>}<BulkJobProgress job={job} /></> : error ?<p className="text-sm text-red-600 dark:text-red-400">{error}</p> : <LoadingSpinner label="Carregando envio..." className="w-full justify-center py-8" />}
        </div>
      </div>
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
