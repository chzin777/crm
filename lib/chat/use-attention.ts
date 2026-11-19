"use client";
import { useEffect, useState } from "react";

const INTERVAL_MS = 15_000;
const HIDDEN_INTERVAL_MS = 60_000;

export type ChatAttention = { count: number; waiting: number; mine: number };

/**
 * Contador global do atendimento (fila aguardando + meus atendimentos com não lidas), em qualquer página:
 * atualiza na hora pelos avisos do servidor (/api/chat/stream) e, de reserva, por consulta leve periódica.
 */
export function useChatAttention(enabled: boolean): ChatAttention | null {
  const [value, setValue] = useState<ChatAttention | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: number;
    let pending = false;
    let debounce: number | undefined;
    let events: EventSource | null = null;

    const load = async () => {
      if (!alive || pending) return;
      pending = true;
      try {
        const response = await fetch("/api/chat/attention", { cache: "no-store", signal: AbortSignal.timeout(8000) });
        // Sem acesso ao atendimento: para de consultar.
        if (response.status === 401 || response.status === 403) {
          alive = false;
          events?.close();
          return;
        }
        if (response.ok && alive) setValue((await response.json()) as ChatAttention);
      } catch {
        // Falha passageira: a próxima rodada tenta de novo.
      } finally {
        pending = false;
        schedule();
      }
    };
    const schedule = () => {
      if (!alive) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(load, document.hidden ? HIDDEN_INTERVAL_MS : INTERVAL_MS);
    };
    // Vários avisos seguidos viram uma consulta só.
    const onChange = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void load(), 400);
    };
    const onVisible = () => {
      if (!document.hidden) onChange();
    };

    try {
      events = new EventSource("/api/chat/stream");
      events.onmessage = onChange;
    } catch {
      events = null;
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onChange);
    void load();

    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.clearTimeout(debounce);
      events?.close();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onChange);
    };
  }, [enabled]);

  return enabled ? value : null;
}

export const attentionLabel = (count: number) => (count > 99 ? "99+" : String(count));
