"use client";
import { useEffect, useRef, useState } from "react";
import { alertUser } from "@/lib/chat/alerts";

const INTERVAL_MS = 6000;
const MAX_BACKOFF = 5;

/** Devolve um contador que sobe sempre que o estado do atendimento muda no servidor. */
export function usePulse() {
  const [tick, setTick] = useState(0);
  const mark = useRef<string | null>(null);
  const previous = useRef<{ unread: number; notifications: number } | null>(null);

  useEffect(() => {
    let alive = true;
    let running = false;
    let backoff = 0;
    let timer: number;

    function schedule() {
      if (!alive) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(beat, INTERVAL_MS * (backoff + 1));
    }

    async function beat() {
      if (!alive || running) return;
      if (document.hidden) return schedule();
      running = true;
      try {
        const response = await fetch("/api/chat/pulse", { cache: "no-store" });
        if (response.status === 401) {
          alive = false;
          return;
        }
        if (response.ok) {
          const data = (await response.json()) as { mark: string; unread: number; notifications: number };
          if (mark.current !== null && data.mark !== mark.current) setTick((value) => value + 1);
          mark.current = data.mark;
          const last = previous.current;
          if (last && data.unread > last.unread) alertUser("Mensagem nova", "Um cliente está esperando resposta.");
          else if (last && data.notifications > last.notifications) alertUser("Aviso do atendimento", "Abra as notificações para ver.");
          previous.current = { unread: data.unread, notifications: data.notifications };
          backoff = 0;
        }
      } catch {
        backoff = Math.min(backoff + 1, MAX_BACKOFF);
      } finally {
        running = false;
        schedule();
      }
    }

    const onVisible = () => {
      if (!document.hidden) void beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    void beat();

    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return tick;
}
