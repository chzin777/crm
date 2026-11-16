"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, CornerDownLeft, Database, ExternalLink, Loader2, Search, Send, X, Zap } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import type { ChatOperationalContext, QuickQueryKind, QuickSuggestion } from "@/lib/chat/operational-context";
import type { QuickQueryResult } from "@/lib/chat/quick-query";
import type { CopilotAnswer, CopilotTurn } from "@/lib/chat/operator-copilot";

type Context = ChatOperationalContext & { cpfMasked: string | null };
type Turn = CopilotTurn & { reply?: string | null };

const TABS: { id: QuickQueryKind; label: string; placeholder: string; field: "identity" | "term" | "none" }[] = [
  { id: "faturas", label: "💳 Faturas", placeholder: "CPF ou nome completo", field: "identity" },
  { id: "estoque", label: "🕶️ Estoque", placeholder: "Referência, marca ou modelo", field: "term" },
  { id: "compras", label: "🧾 Compras & OS", placeholder: "CPF ou nome (vazio = este contato)", field: "identity" },
  { id: "receitas", label: "👓 Receitas", placeholder: "", field: "none" },
];
const TONE: Record<string, string> = {
  ok: "text-emerald-700 dark:text-emerald-300",
  warn: "text-amber-700 dark:text-amber-300",
  danger: "text-red-600 dark:text-red-300",
  muted: "text-slate-600 dark:text-slate-300",
};
const INSERT = "inline-flex h-7 cursor-pointer items-center gap-1 rounded-md bg-[#C4D600] px-2.5 text-[11px] font-bold text-[#051647] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";

const paramsFor = (field: "identity" | "term" | "none", value: string) => {
  const text = value.trim();
  if (field === "term") return { term: text };
  if (field === "none" || !text) return {};
  return text.replace(/\D/g, "").length === 11 && !/[a-z]{3}/i.test(text) ? { cpf: text } : { name: text };
};

function ResultCard({ result, canInsert, onInsert, onPick }: { result: QuickQueryResult; canInsert: boolean; onInsert: (text: string) => void; onPick: (cpf: string, name: string) => void }) {
  return (
    <article className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-white/[0.03]">
      <header className="min-w-0">
        <p className="truncate text-sm font-bold text-slate-900 dark:text-white" title={result.title}>{result.title}</p>
        {result.subtitle && <p className="text-[11px] text-slate-500 dark:text-slate-400">{result.subtitle}</p>}
      </header>
      {result.lines.length > 0 && (
        <dl className="space-y-1">
          {result.lines.map((line, index) => (
            <div key={`${line.label}-${index}`} className="flex items-start justify-between gap-3">
              <dt className="min-w-0 truncate text-slate-500 dark:text-slate-400" title={line.label}>{line.label}</dt>
              <dd className={`shrink-0 text-right font-semibold ${TONE[line.tone ?? "muted"]}`}>
                {line.link ? <a href={line.link} target="_blank" rel="noopener noreferrer" className="inline-flex cursor-pointer items-center gap-1 text-[#002187] hover:underline dark:text-[#C4D600]">Ver anexo<ExternalLink className="h-3 w-3" /></a> : line.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {result.candidates && (
        <ul className="space-y-1">
          {result.candidates.map((item) => (
            <li key={item.cpf}>
              <button type="button" onClick={() => onPick(item.cpf, item.name)} className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/5">
                <span className="truncate font-semibold text-slate-800 dark:text-slate-100">{item.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-slate-500">{item.cpfMasked}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {result.reply && (
        <div className="flex justify-end border-t border-slate-100 pt-2 dark:border-slate-800">
          <button type="button" disabled={!canInsert} onClick={() => onInsert(result.reply!)} title={canInsert ? "Preenche a caixa de mensagem para você revisar e enviar" : "Conversa sem permissão de envio"} className={INSERT}>
            <CornerDownLeft className="h-3.5 w-3.5" />Jogar na mensagem
          </button>
        </div>
      )}
    </article>
  );
}

/**
 * Copiloto VMSet: painel direito do /chat com sugestões automáticas da conversa, consultas rápidas sem SQL e
 * mini-chat interno com a IA. Tudo só leitura; "Jogar na mensagem" só preenche a caixa de digitação.
 */
export function VmsetCopilotPanel({ conversationId, tick, canInsert, onInsert, onClose }: { conversationId: string; tick: number; canInsert: boolean; onInsert: (text: string) => void; onClose: () => void }) {
  const toast = useToast();
  const [context, setContext] = useState<Context | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<QuickSuggestion[]>([]);
  const [tab, setTab] = useState<QuickQueryKind>("faturas");
  const [inputs, setInputs] = useState<Record<QuickQueryKind, string>>({ faturas: "", estoque: "", compras: "", receitas: "" });
  const [result, setResult] = useState<QuickQueryResult | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  const prefilled = useRef(false);

  // Contexto relido a cada mensagem nova (tick), para a sugestão acompanhar a conversa.
  useEffect(() => {
    let active = true;
    setContextError(null);
    fetch(`/api/vmset/quick-query?conversationId=${encodeURIComponent(conversationId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as { context: Context; suggestions: QuickSuggestion[]; error?: string } | null;
        if (!response.ok || !data) throw new Error(data?.error ?? "Não foi possível ler o contexto da conversa.");
        return data;
      })
      .then((data) => {
        if (!active) return;
        setContext(data.context);
        setSuggestions(data.suggestions);
        if (!prefilled.current) {
          prefilled.current = true;
          setInputs((current) => ({ ...current, faturas: data.context.cpf ?? data.context.name ?? "", compras: data.context.cpf ?? data.context.name ?? "", estoque: data.context.product ?? "" }));
          if (data.context.intent === "estoque_preco") setTab("estoque");
          else if (data.context.intent === "historico_compras_os") setTab("compras");
          else if (data.context.intent === "receituario") setTab("receitas");
        }
      })
      .catch((error: unknown) => {
        if (active) setContextError(error instanceof Error ? error.message : "Não foi possível ler o contexto da conversa.");
      });
    return () => {
      active = false;
    };
  }, [conversationId, tick]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [turns, asking]);

  const run = async (kind: QuickQueryKind, params: Record<string, string>, key: string) => {
    setLoading(key);
    setTab(kind);
    try {
      const response = await fetch("/api/vmset/quick-query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, kind, params }) });
      const data = (await response.json().catch(() => null)) as (QuickQueryResult & { error?: string }) | null;
      if (!response.ok || !data) throw new Error(data?.error ?? "Não foi possível consultar.");
      setResult(data);
    } catch (error) {
      toast.error("Consulta VMSet", error instanceof Error ? error.message : "Falha na consulta.");
    } finally {
      setLoading(null);
    }
  };

  const current = TABS.find((item) => item.id === tab)!;
  const submitQuery = (event: FormEvent) => {
    event.preventDefault();
    void run(tab, paramsFor(current.field, inputs[tab]) as Record<string, string>, `tab-${tab}`);
  };

  const ask = async (event: FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || asking) return;
    setTurns((list) => [...list, { role: "operator", text }]);
    setQuestion("");
    setAsking(true);
    try {
      const response = await fetch("/api/chat/operator-copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, question: text }) });
      const data = (await response.json().catch(() => null)) as (CopilotAnswer & { error?: string }) | null;
      if (!response.ok || !data) throw new Error(data?.error ?? "O copiloto não respondeu.");
      setTurns((list) => [...list, { role: "copilot", text: data.answer, reply: data.customerReply }]);
    } catch (error) {
      setTurns((list) => [...list, { role: "copilot", text: `⚠️ ${error instanceof Error ? error.message : "Falha ao responder."}` }]);
    } finally {
      setAsking(false);
    }
  };

  const insert = (text: string) => {
    onInsert(text);
    toast.success("Texto na caixa de mensagem", "Revise e envie quando quiser.");
  };

  return (
    <aside aria-label="Copiloto VMSet" className="absolute inset-y-0 right-0 z-30 flex h-full w-[380px] max-w-full shrink-0 flex-col border-l border-slate-200 bg-white shadow-xl lg:static lg:shadow-none xl:w-[420px] dark:border-slate-800 dark:bg-[#07194f]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Database className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" />Copiloto VMSet</h3>
        <button type="button" onClick={onClose} aria-label="Fechar Copiloto VMSet" title="Fechar" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 [scrollbar-gutter:stable]">
        <section className="space-y-2">
          <h4 className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"><Zap className="h-3.5 w-3.5 text-[#F7915E]" />Sugerido para esta conversa</h4>
          {context && (context.cpfMasked || context.product) && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {context.cpfMasked && <>CPF {context.cpfMasked} ({context.cpfSource === "chat" ? "do chat" : "do cadastro"})</>}
              {context.cpfMasked && context.product && " · "}
              {context.product && <>Produto: {context.product}</>}
            </p>
          )}
          {suggestions.length ? (
            <div className="space-y-1.5">
              {suggestions.map((item, index) => (
                <button key={`${item.kind}-${index}`} type="button" disabled={!!loading} onClick={() => void run(item.kind, item.params as Record<string, string>, `s-${index}`)} className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-[#002187]/15 bg-[#f5f8ff] px-3 py-2 text-left text-xs font-semibold text-[#051647] transition-colors hover:border-[#002187]/40 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-[#051647] dark:text-white">
                  <span className="min-w-0 flex-1 truncate" title={item.label}>{item.label}</span>
                  {loading === `s-${index}` && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs italic text-slate-400">{context ? "Nada específico detectado. Use as consultas abaixo." : contextError ?? "Lendo a conversa..."}</p>
          )}
        </section>

        <section className="space-y-2">
          <div role="tablist" aria-label="Consultas rápidas" className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-white/5">
            {TABS.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`cursor-pointer truncate rounded-md px-1 py-1.5 text-[11px] font-semibold transition-colors ${tab === item.id ? "bg-white text-[#051647] shadow-xs dark:bg-[#051647] dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`} title={item.label}>
                {item.label}
              </button>
            ))}
          </div>
          <form onSubmit={submitQuery} className="flex gap-1.5">
            {current.field !== "none" && (
              <input value={inputs[tab]} onChange={(event) => setInputs((list) => ({ ...list, [tab]: event.target.value }))} placeholder={current.placeholder} aria-label={current.placeholder} maxLength={120} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" />
            )}
            <button type="submit" disabled={!!loading} className={`inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#002187] px-3 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-60 dark:bg-[#C4D600] dark:text-[#051647] ${current.field === "none" ? "w-full" : ""}`}>
              {loading === `tab-${tab}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {current.field === "none" ? "Ver receitas do contato" : "Consultar"}
            </button>
          </form>
          {result && <ResultCard result={result} canInsert={canInsert} onInsert={insert} onPick={(cpf, name) => { setInputs((list) => ({ ...list, [result.kind]: cpf })); void run(result.kind, { cpf, name }, `tab-${result.kind}`); }} />}
        </section>
      </div>

      <section aria-label="Chat interno com a IA" className="flex h-[42%] min-h-[220px] shrink-0 flex-col border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-[#051647]/60">
        <p className="flex shrink-0 items-center gap-1.5 px-3 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"><Bot className="h-3.5 w-3.5" />Pergunte à IA <span className="font-normal normal-case">(só você vê)</span></p>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
          {!turns.length && <p className="text-xs italic text-slate-400">Ex.: &quot;Quantas parcelas faltam pra ela?&quot; ou &quot;Qual loja tem o RB3025?&quot;</p>}
          {turns.map((turn, index) => (
            <div key={index} className={turn.role === "operator" ? "flex justify-end" : "space-y-1.5"}>
              <p className={`max-w-[90%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-xs ${turn.role === "operator" ? "bg-[#002187] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "bg-white text-slate-800 shadow-xs dark:bg-white/10 dark:text-slate-100"}`}>{turn.text}</p>
              {turn.reply && (
                <button type="button" disabled={!canInsert} onClick={() => insert(turn.reply!)} title={turn.reply} className={INSERT}>
                  <CornerDownLeft className="h-3.5 w-3.5" />Usar como resposta ao cliente
                </button>
              )}
            </div>
          ))}
          {asking && <p className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Consultando...</p>}
          <div ref={chatEnd} />
        </div>
        <form onSubmit={(event) => void ask(event)} className="flex shrink-0 gap-1.5 border-t border-slate-200 p-2 dark:border-slate-800">
          <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Pergunte sobre parcelas, estoque, compras..." aria-label="Pergunta para a IA" maxLength={600} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" />
          <button type="submit" disabled={asking || !question.trim()} aria-label="Perguntar" className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg bg-[#002187] text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#C4D600] dark:text-[#051647]">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </section>
    </aside>
  );
}
