"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import type { Pillar, RfvpSettings } from "@/lib/rfvp";

export type RfvpFilter = Record<`${Pillar}${"Min" | "Max"}`, string>;
export const EMPTY_RFVP_FILTER: RfvpFilter = { rMin: "", rMax: "", fMin: "", fMax: "", vMin: "", vMax: "", pMin: "", pMax: "" };

export type RfvpSegmentInfo = { key: string; label: string; description: string; tone: string; dot: string; count: number };
export type RfvpRun = { at: string; finishedAt: string | null; changed: number; events: number; punctuality: number | null; warning: string | null; error: string | null; trigger: string };
export type RfvpStatus = { settings: RfvpSettings; lastRun: RfvpRun | null; running: boolean; segments: RfvpSegmentInfo[]; punctuality: { customers: number; syncedAt: string | null } };

/**
 * Estado da matriz RFV-P (critérios, segmentos, último cálculo) e o "Recalcular RFV-P": acompanha a cada 4 s
 * enquanto calcula e avisa ao terminar.
 */
export function useRfvpStatus(onFinished: () => void) {
  const toast = useToast();
  const [status, setStatus] = useState<RfvpStatus | null>(null);
  const wasRunning = useRef(false);
  const finished = useRef(onFinished);
  useEffect(() => { finished.current = onFinished; }, [onFinished]);

  const reload = useCallback(async () => {
    const response = await fetch("/api/rfvp", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const body = (await response.json()) as RfvpStatus;
    setStatus(body);
    if (wasRunning.current && !body.running) {
      const run = body.lastRun;
      if (run?.error) toast.error("Recálculo RFV-P falhou", run.error);
      else toast.success("RFV-P recalculado", `${(run?.changed ?? 0).toLocaleString("pt-BR")} cliente(s) mudaram de código ou segmento${run?.events ? ` · ${run.events} automação(ões) disparada(s)` : ""}.`);
      if (run?.warning) toast.error("Pontualidade", run.warning);
      finished.current();
    }
    wasRunning.current = body.running;
  }, [toast]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (!status?.running) return;
    const timer = setInterval(() => void reload(), 4000);
    return () => clearInterval(timer);
  }, [status?.running, reload]);

  const recalculate = useCallback(async () => {
    const response = await fetch("/api/rfvp", { method: "POST" }).catch(() => null);
    if (!response?.ok) { toast.error("Não foi possível iniciar o recálculo"); return; }
    wasRunning.current = true;
    setStatus((current) => (current ? { ...current, running: true } : current));
    toast.success("Recalculando RFV-P", "Sincronizando a pontualidade no VMSet e recalculando todos os clientes.");
  }, [toast]);

  return { status, reload, recalculate };
}

/** Segmentos RFV-P com contagem; clique filtra a tabela (clique de novo limpa). */
export function RfvpSegmentsStrip({ segments, selected, onSelect }: { segments: RfvpSegmentInfo[] | null; selected: string; onSelect: (key: string) => void }) {
  if (!segments) return <p className="flex items-center gap-1.5 text-[11px] text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando segmentos...</p>;
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]" role="group" aria-label="Segmentos RFV-P">
      {segments.map((segment) => {
        const active = selected === segment.key;
        return (
          <button key={segment.key} type="button" onClick={() => onSelect(active ? "" : segment.key)} aria-pressed={active} title={segment.description}
            className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-shadow ${segment.tone} ${active ? "ring-2 ring-[#002187] dark:ring-[#C4D600]" : "ring-transparent hover:ring-slate-300 dark:hover:ring-white/20"}`}>
            {segment.label}<span className="rounded-full bg-white/60 px-1.5 text-[10px] tabular-nums dark:bg-black/20">{segment.count.toLocaleString("pt-BR")}</span>
          </button>
        );
      })}
    </div>
  );
}
