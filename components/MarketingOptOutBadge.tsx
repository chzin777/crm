"use client";

import { useEffect, useState } from "react";
import { Activity, BellOff, PhoneOff } from "lucide-react";
import { useToast } from "@/components/ToastProvider";

type State = {
  marketingOptOut: boolean; marketingOptOutAt: string | null; marketingOptOutReason: string | null;
  invalidWhatsApp?: boolean; invalidWhatsAppAt?: string | null; invalidWhatsAppReason?: string | null; engagementScore?: number;
};

/** Selo "Opt-out / Não perturbe" + alternância manual (cliente pediu pelo telefone ou no balcão). */
export function MarketingOptOutBadge({ contactId, canWrite = true }: { contactId: string; canWrite?: boolean }) {
  const toast = useToast();
  const [state, setState] = useState<State | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/contacts/${encodeURIComponent(contactId)}/marketing`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: State | null) => { if (active) setState(data); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [contactId]);

  if (!state) return null;

  const toggle = async () => {
    const next = !state.marketingOptOut;
    if (next && !window.confirm("Descadastrar este cliente? Ele deixa de receber campanhas e envios em massa.")) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/marketing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optOut: next }),
      });
      if (!response.ok) throw new Error();
      setState((await response.json()) as State);
      toast.success(next ? "Cliente descadastrado." : "Cliente volta a receber campanhas.");
    } catch {
      toast.error("Não foi possível alterar o opt-out.");
    } finally {
      setSaving(false);
    }
  };

  const since = state.marketingOptOutAt ? new Date(state.marketingOptOutAt).toLocaleDateString("pt-BR") : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      {state.marketingOptOut ? (
        <span title={[since && `Desde ${since}`, state.marketingOptOutReason].filter(Boolean).join(" · ")} className="inline-flex items-center gap-1 rounded-full bg-[#F7915E]/15 px-2 py-0.5 font-semibold text-[#c25a26] dark:text-[#F7915E]">
          <BellOff className="h-3 w-3" aria-hidden="true" />
          Descadastrado
        </span>
      ) : (
        <span className="text-slate-500 dark:text-slate-400">Recebe campanhas</span>
      )}
      {state.invalidWhatsApp && (
        <span title={[state.invalidWhatsAppAt && `Desde ${new Date(state.invalidWhatsAppAt).toLocaleDateString("pt-BR")}`, state.invalidWhatsAppReason].filter(Boolean).join(" · ")} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
          <PhoneOff className="h-3 w-3" aria-hidden="true" />
          WhatsApp inválido
        </span>
      )}
      {typeof state.engagementScore === "number" && (
        <span title="Score de engajamento: +5 leu campanha, +15 respondeu, −5 por campanha não lida em 72 h" className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${state.engagementScore > 0 ? "bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600]" : state.engagementScore < 0 ? "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
          <Activity className="h-3 w-3" aria-hidden="true" />
          Engajamento {state.engagementScore > 0 ? `+${state.engagementScore}` : state.engagementScore}
        </span>
      )}
      {canWrite && (
        <button type="button" onClick={() => void toggle()} disabled={saving} className="cursor-pointer rounded-md px-1.5 py-0.5 font-medium text-[#002187] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#C4D600]">
          {state.marketingOptOut ? "Reativar campanhas" : "Descadastrar"}
        </button>
      )}
    </div>
  );
}
