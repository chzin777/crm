"use client";
import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, RefreshCw, Send, Sparkles } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";

type Summary = { summary: string; customerNeed: string; nextSteps: string[]; sentiment: "positivo" | "neutro" | "negativo"; pending: boolean };
type ProductSuggestion = { product: string; reason: string; pitch: string };

async function askAi<T>(conversationId: string, action: "summary" | "products"): Promise<T> {
  const response = await fetch(`/api/chat/conversations/${conversationId}/ai`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Não foi possível gerar a resposta da IA.");
  return data;
}

const SENTIMENT = {
  positivo: "bg-[#C4D600]/30 text-[#051647] dark:text-[#C4D600]",
  neutro: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
  negativo: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

/** Resumo do atendimento gerado pela IA, para quem assume ou supervisiona a conversa. */
export function AiSummaryDialog({ conversationId, customerName, onClose }: { conversationId: string; customerName: string; onClose: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSummary(await askAi<Summary>(conversationId, "summary"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar o resumo.");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Primeira leitura ao abrir (o estado inicial já é "carregando"); "Gerar de novo" usa load().
  useEffect(() => {
    let active = true;
    askAi<Summary>(conversationId, "summary")
      .then((data) => { if (active) setSummary(data); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Não foi possível gerar o resumo."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [conversationId]);

  return (
    <EntityDialog titleId="ai-summary-title" title="Resumo do atendimento (IA)" description={`Conversa com ${customerName}. Confira os detalhes no histórico antes de agir.`} onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1 text-sm text-slate-700 dark:text-slate-200">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-10"><LoadingSpinner label="Lendo a conversa..." size={32} /></div>
        ) : error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>
        ) : summary && (
          <>
            <div className="flex flex-wrap gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${SENTIMENT[summary.sentiment]}`}>Cliente {summary.sentiment}</span>
              {summary.pending && <span className="rounded-full bg-[#F7915E]/20 px-2 py-0.5 text-[11px] font-semibold text-[#b4531f] dark:text-[#F7915E]">Pendente de resposta</span>}
            </div>
            {summary.customerNeed && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">O que o cliente quer</p>
                <p className="mt-1">{summary.customerNeed}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Resumo</p>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed">{summary.summary}</p>
            </div>
            {summary.nextSteps.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Próximos passos</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">{summary.nextSteps.map((step) => <li key={step}>{step}</li>)}</ul>
              </div>
            )}
          </>
        )}
        <div className="mt-auto flex justify-end gap-2 pt-2">
          <button type="button" disabled={loading} onClick={() => void load()} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">
            <RefreshCw className="h-3.5 w-3.5" />Gerar de novo
          </button>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-lg bg-[#051647] px-4 py-2 text-xs font-semibold text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]">Fechar</button>
        </div>
      </div>
    </EntityDialog>
  );
}

/** Oportunidades de venda sugeridas pela IA no painel do cliente; a oferta vai para o campo de mensagem, nunca direto ao cliente. */
export function AiProductSuggestions({ conversationId, onUsePitch }: { conversationId: string; onUsePitch?: (text: string) => void }) {
  const [items, setItems] = useState<ProductSuggestion[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setItems((await askAi<{ suggestions: ProductSuggestion[] }>(conversationId, "products")).suggestions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível sugerir produtos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-2.5 py-2 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
      {items && items.length === 0 && <p className="text-xs text-slate-400">A IA não encontrou uma oportunidade clara para este cliente.</p>}
      {items?.map((item) => (
        <div key={item.product} className="rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{item.product}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{item.reason}</p>
          {item.pitch && (
            <div className="mt-1.5 flex gap-1">
              {onUsePitch && (
                <button type="button" onClick={() => onUsePitch(item.pitch)} className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-[#C4D600] px-2 py-0.5 text-[11px] font-semibold text-[#051647] hover:opacity-90">
                  <Send className="h-3 w-3" />Usar na resposta
                </button>
              )}
              <button type="button" onClick={() => void navigator.clipboard?.writeText(item.pitch)} className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10">
                <Copy className="h-3 w-3" />Copiar
              </button>
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        disabled={loading}
        onClick={() => void load()}
        className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#002187]/40 px-2.5 py-2 text-xs font-semibold text-[#002187] hover:bg-[#002187]/5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#C4D600]/40 dark:text-[#C4D600] dark:hover:bg-white/5"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {loading ? "Analisando o cliente..." : items ? "Sugerir de novo" : "Sugerir produtos com IA"}
      </button>
    </div>
  );
}
