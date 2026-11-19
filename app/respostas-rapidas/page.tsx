"use client";

import { useEffect, useState } from "react";
import { QuickRepliesPanel } from "@/components/chat/QuickRepliesPanel";

/** Gestão de todas as respostas rápidas do atendimento (equipe e pessoais). */
export default function RespostasRapidasPage() {
  const [queues, setQueues] = useState<{ id: string; name: string }[] | undefined>(undefined);

  useEffect(() => {
    let active = true;
    fetch("/api/chat/queues", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { data?: { id: string; name: string }[]; queues?: { id: string; name: string }[] };
        const list = body.data ?? body.queues;
        if (active && Array.isArray(list)) setQueues(list.map((queue) => ({ id: queue.id, name: queue.name })));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  return (
    <div className="min-w-0 space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-[#051647] dark:text-white">Respostas Rápidas</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Textos padrão do atendimento. Na conversa, digite / e o atalho ou use o botão de respostas rápidas.</p>
      </header>
      <QuickRepliesPanel queues={queues} />
    </div>
  );
}
