"use client";
/* eslint-disable @next/next/no-img-element -- foto do cliente vem do nosso armazenamento, sem otimização do Next. */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Hourglass, Inbox, MessageSquare } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { elapsedLabel, initials } from "@/lib/chat/format";
import { formatPhone } from "@/lib/chat/phone";
import { usePulse } from "@/lib/chat/use-pulse";

type Waiting = {
  position: number;
  conversationId: string;
  name: string;
  avatarUrl: string | null;
  phone: string;
  waitingSince: string;
  positionSince: string;
  lastMessage: string;
};

const minutesSince = (value: string, now: number) => Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000));

/** Clientes aguardando na fila, na ordem de chegada, com os tempos correndo ao vivo. */
export function QueueWaitingList({ queueId, act }: { queueId: string; act: (url: string, method: string, body?: unknown, success?: string) => Promise<boolean> }) {
  const router = useRouter();
  const tick = usePulse();
  const [loaded, setLoaded] = useState<{ queueId: string; items: Waiting[] } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [taking, setTaking] = useState<string | null>(null);

  // Atualiza quando alguém entra, é atendido ou a fila anda (aviso em tempo real do chat).
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/chat/queues/${queueId}/waiting`, { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { data: [] }))
      .then((result: { data: Waiting[] }) => setLoaded({ queueId, items: result.data }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [queueId, tick]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const take = async (conversationId: string) => {
    setTaking(conversationId);
    const done = await act(`/api/chat/conversations/${conversationId}/assume`, "POST", undefined, "Atendimento assumido.");
    setTaking(null);
    if (done) router.push(`/chat?c=${conversationId}`);
  };

  const items = loaded?.queueId === queueId ? loaded.items : null;

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Clientes aguardando</h3>
        {items && items.length > 0 && <span className="text-xs text-slate-500 dark:text-slate-400">Ordem de chegada · atualiza sozinho</span>}
      </div>

      {!items ? (
        <div className="grid h-24 place-items-center"><LoadingSpinner label="Carregando fila..." /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-6 py-8 text-center dark:border-slate-700">
          <Inbox className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">Ninguém aguardando nesta fila</p>
        </div>
      ) : (
        <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80 dark:divide-slate-800 dark:border-slate-700/80">
          {items.map((item) => {
            const total = minutesSince(item.waitingSince, now);
            const atPosition = minutesSince(item.positionSince, now);
            return (
              <li key={item.conversationId} className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap">
                <span className={`grid h-8 min-w-8 shrink-0 place-items-center rounded-lg px-1 text-xs font-bold ${item.position === 1 ? "bg-[#C4D600] text-[#051647]" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>{item.position}º</span>
                {item.avatarUrl ? (
                  <img src={item.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#051647] text-xs font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">{initials(item.name)}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{item.name}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{formatPhone(item.phone)}</p>
                  {item.lastMessage && <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-600 dark:text-slate-300"><MessageSquare className="h-3 w-3 shrink-0" /><span className="truncate">{item.lastMessage}</span></p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span title="Tempo total de espera" className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${total >= 15 ? "bg-[#F7915E]/20 text-[#9a3f12] dark:text-[#F7915E]" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}><Clock className="h-3 w-3" />{elapsedLabel(total)}</span>
                  <span title="Tempo na posição atual" className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400"><Hourglass className="h-3 w-3" />{elapsedLabel(atPosition)} nesta posição</span>
                </div>
                <button type="button" disabled={taking !== null} onClick={() => void take(item.conversationId)} className="h-8 shrink-0 cursor-pointer rounded-lg bg-[#051647] px-3 text-xs font-semibold text-white hover:bg-[#002187] disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647]">{taking === item.conversationId ? "Assumindo..." : "Assumir"}</button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
