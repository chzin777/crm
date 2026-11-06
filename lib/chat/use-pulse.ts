"use client";
import { useEffect, useRef, useState } from "react";
import { alertUser } from "@/lib/chat/alerts";

const INTERVAL_MS = 3000;
const HIDDEN_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_BACKOFF = 5;

/** Devolve um contador que sobe sempre que o estado do atendimento muda no servidor. */
export function usePulse() {
  const [tick, setTick] = useState(0);
  const mark = useRef<string | null>(null);
  const previous = useRef<{ unread: number; notifications: number } | null>(null);

  useEffect(() => {
    let alive = true;
    let running = false;
    let again = false;
    let backoff = 0;
    let timer: number;

    function schedule() {
      if (!alive) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(beat, (document.hidden ? HIDDEN_INTERVAL_MS : INTERVAL_MS) * (backoff + 1));
    }

    async function beat() {
      if (!alive) return;
      if (running) {
        // Um aviso durante a consulta pode ter ficado de fora dela: consulta de novo ao terminar.
        again = true;
        return;
      }
      running = true;
      try {
        const response = await fetch("/api/chat/pulse", { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (response.ok) {
          const data = (await response.json()) as { mark: string; unread: number; notifications: number };
          if (mark.current !== null && data.mark !== mark.current) setTick((value) => value + 1);
          mark.current = data.mark;
          const last = previous.current;
          if (last && data.unread > last.unread) alertUser("Mensagem nova", "Um cliente está esperando resposta.");
          else if (last && data.notifications > last.notifications) alertUser("Aviso do atendimento", "Abra as notificações para ver.");
          previous.current = { unread: data.unread, notifications: data.notifications };
          backoff = 0;
        } else {
          // Erro passageiro não pode encerrar a sincronização até o próximo F5.
          backoff = Math.min(backoff + 1, MAX_BACKOFF);
        }
      } catch {
        backoff = Math.min(backoff + 1, MAX_BACKOFF);
      } finally {
        running = false;
        if (again) {
          again = false;
          void beat();
        } else {
          schedule();
        }
      }
    }

    const onVisible = () => {
      if (!document.hidden) void beat();
    };
    const onChange = () => void beat();
    const events = new EventSource("/api/chat/stream");
    events.onopen = onChange;
    events.onmessage = onChange;
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onChange);
    void beat();

    return () => {
      alive = false;
      window.clearTimeout(timer);
      events.close();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onChange);
    };
  }, []);

  return tick;
}
