"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { PRESENCE_DOT, PRESENCE_HINTS, PRESENCE_LABELS, PRESENCE_STATUSES, type PresenceStatus } from "@/lib/chat/presence-status";

/** Heartbeat de interação real: no máximo 1 por minuto, só com clique/toque/teclado. */
const ACTIVITY_INTERVAL_MS = 60_000;

/** Bolinha de presença (Online verde, Ausente laranja, Offline cinza). */
export function PresenceDot({ status, className = "" }: { status: PresenceStatus; className?: string }) {
  return <span title={PRESENCE_LABELS[status]} aria-label={PRESENCE_LABELS[status]} className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${PRESENCE_DOT[status]} ${className}`} />;
}

/**
 * Status do operador na barra lateral: mostra/troca Online, Ausente e Offline e envia a atividade real
 * (sem atividade além do limite de /configuracoes, o servidor coloca em Ausente; a próxima interação volta).
 */
export function PresenceSelector({ collapsed = false }: { collapsed?: boolean }) {
  const toast = useToast();
  const [status, setStatus] = useState<PresenceStatus | null>(null);
  const [awayAuto, setAwayAuto] = useState(false);
  const [open, setOpen] = useState(false);
  const lastSent = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const sendActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastSent.current < ACTIVITY_INTERVAL_MS) return;
    lastSent.current = now;
    void fetch("/api/me/presence", { method: "POST" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { data?: { status: PresenceStatus } } | null) => {
        if (!result?.data) return;
        setStatus(result.data.status);
        if (result.data.status === "ONLINE") setAwayAuto(false);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/me/presence", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { data?: { status: PresenceStatus; awayAuto: boolean } } | null) => {
        if (!active || !result?.data) return;
        setStatus(result.data.status);
        setAwayAuto(result.data.awayAuto);
      })
      .catch(() => undefined);
    const onInteraction = () => sendActivity();
    window.addEventListener("pointerdown", onInteraction, { passive: true });
    window.addEventListener("keydown", onInteraction);
    return () => {
      active = false;
      window.removeEventListener("pointerdown", onInteraction);
      window.removeEventListener("keydown", onInteraction);
    };
  }, [sendActivity]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!boxRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const choose = async (next: PresenceStatus) => {
    setOpen(false);
    const previous = status;
    setStatus(next);
    setAwayAuto(false);
    try {
      const response = await fetch("/api/me/presence", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
      if (!response.ok) throw new Error();
      toast.success(`Status: ${PRESENCE_LABELS[next]}`, PRESENCE_HINTS[next]);
    } catch {
      setStatus(previous);
      toast.error("Não foi possível alterar o status.");
    }
  };

  if (!status) return null;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={collapsed ? `${PRESENCE_LABELS[status]}${awayAuto ? " (inatividade)" : ""}` : undefined}
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full items-center rounded-lg px-2 py-1.5 text-[12px] font-semibold text-[#47536a] transition hover:cursor-pointer hover:bg-[#f7f8fa] dark:text-slate-300 dark:hover:bg-white/5 ${collapsed ? "justify-center" : "gap-2 text-left"}`}
      >
        <PresenceDot status={status} />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{PRESENCE_LABELS[status]}{awayAuto ? " · inatividade" : ""}</span>}
      </button>
      {open && (
        <div role="menu" aria-label="Status de atendimento" className={`absolute z-40 mb-2 min-w-[240px] rounded-xl border border-[#e5e8ee] bg-white p-1.5 shadow-[0_8px_24px_rgba(20,35,68,0.14)] dark:border-slate-700 dark:bg-[#07194f] ${collapsed ? "bottom-0 left-full ml-2" : "bottom-full left-0 right-0"}`}>
          {PRESENCE_STATUSES.map((option) => (
            <button key={option} type="button" role="menuitemradio" aria-checked={status === option} onClick={() => void choose(option)} className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:cursor-pointer hover:bg-[#f5f7fb] dark:hover:bg-white/10">
              <PresenceDot status={option} className="mt-1" />
              <span className="min-w-0 flex-1 break-words">
                <span className="block text-[12px] font-semibold text-[#34415e] dark:text-white">{PRESENCE_LABELS[option]}</span>
                <span className="block text-[11px] text-[#929bad] dark:text-slate-400">{PRESENCE_HINTS[option]}</span>
              </span>
              {status === option && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#002187] dark:text-[#C4D600]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
