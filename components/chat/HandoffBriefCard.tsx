"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ClipboardList, Eye, Glasses, MapPin, Pin, Tag, UserRound } from "lucide-react";

type Brief = { customer: string; interest: string; products: string; prescription: string; store: string; createdAt: string };

/** Resumo executivo do transbordo da IA, fixado no topo do atendimento (nome, interesse, modelos, receita e loja). */
export function HandoffBriefCard({ conversationId, tick }: { conversationId: string; tick: number }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(`/api/chat/conversations/${conversationId}/brief`)
      .then(async (response) => (response.ok ? ((await response.json()) as { brief: Brief | null }) : { brief: null }))
      .then((data) => { if (active) setBrief(data.brief); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [conversationId, tick]);

  if (!brief) return null;
  const rows = [
    { icon: UserRound, label: "Cliente", value: brief.customer },
    { icon: Glasses, label: "Interesse", value: brief.interest },
    { icon: Tag, label: "Marcas/modelos", value: brief.products },
    { icon: Eye, label: "Receita", value: brief.prescription },
    { icon: MapPin, label: "Loja/região", value: brief.store },
  ];

  return (
    <div className="shrink-0 border-b border-slate-200 bg-[#C4D600]/10 px-3 py-2 xl:px-4 dark:border-slate-800 dark:bg-[#C4D600]/5">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full cursor-pointer items-center gap-2 text-left">
        <Pin className="h-3.5 w-3.5 shrink-0 text-[#002187] dark:text-[#C4D600]" />
        <ClipboardList className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#051647] dark:text-white">Resumo do transbordo da IA</span>
        <span className="shrink-0 text-[10px] text-slate-500 dark:text-slate-400">{new Date(brief.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />}
      </button>
      {open && (
        <dl className="mt-2 grid min-w-0 gap-x-4 gap-y-1 sm:grid-cols-2">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className={`flex min-w-0 items-start gap-1.5 text-xs ${label === "Receita" ? "sm:col-span-2" : ""}`}>
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
              <dt className="shrink-0 font-medium text-slate-600 dark:text-slate-300">{label}:</dt>
              <dd className="min-w-0 break-words text-slate-800 dark:text-slate-100">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
