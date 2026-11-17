"use client";

import { useEffect, useState } from "react";
import { BellOff } from "lucide-react";
import { useToast } from "@/components/ToastProvider";

type State = { marketingOptOut: boolean; marketingOptOutAt: string | null; marketingOptOutReason: string | null };

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
    if (next && !window.confirm("Marcar este cliente como \"Não perturbe\"? Ele deixa de receber campanhas e envios em massa.")) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/marketing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optOut: next }),
      });
      if (!response.ok) throw new Error();
      setState((await response.json()) as State);
      toast.success(next ? "Cliente marcado como Não perturbe." : "Cliente volta a receber campanhas.");
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
          Opt-out / Não perturbe
        </span>
      ) : (
        <span className="text-slate-500 dark:text-slate-400">Recebe campanhas</span>
      )}
      {canWrite && (
        <button type="button" onClick={() => void toggle()} disabled={saving} className="cursor-pointer rounded-md px-1.5 py-0.5 font-medium text-[#002187] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#C4D600]">
          {state.marketingOptOut ? "Reativar campanhas" : "Marcar Não perturbe"}
        </button>
      )}
    </div>
  );
}
