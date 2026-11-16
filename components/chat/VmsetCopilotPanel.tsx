"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, Bot, CornerDownLeft, CreditCard, Database, ExternalLink, FileText, Glasses, Loader2, Receipt, Search, Send, X, Zap, type LucideIcon } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import type { ChatOperationalContext, QuickQueryKind, QuickSuggestion } from "@/lib/chat/operational-context";
import type { QuickQueryResult } from "@/lib/chat/quick-query";
import type { CopilotAnswer, CopilotTurn } from "@/lib/chat/operator-copilot";

type Context = ChatOperationalContext & { cpfMasked: string | null };
type Turn = CopilotTurn & { reply?: string | null; error?: boolean };

const TABS: { id: QuickQueryKind; label: string; placeholder: string; field: "identity" | "term" | "none" }[] = [
  { id: "faturas", label: "Faturas", placeholder: "CPF ou nome completo", field: "identity" },
  { id: "estoque", label: "Estoque", placeholder: "Referência, marca ou modelo", field: "term" },
  { id: "compras", label: "Compras", placeholder: "CPF ou nome (vazio = este contato)", field: "identity" },
  { id: "receitas", label: "Receitas", placeholder: "", field: "none" },
];
const QUERY_ICONS: Record<QuickQueryKind, LucideIcon> = { faturas: CreditCard, estoque: Glasses, compras: Receipt, receitas: FileText };
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
  const Icon = QUERY_ICONS[result.kind];
  return (
    <article className="w-full min-w-0 space-y-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-white/[0.03]">
      <header className="w-full min-w-0">
        <p className="flex min-w-0 items-start gap-1.5 text-sm font-bold text-slate-900 dark:text-white"><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">{result.title}</span></p>
        {result.subtitle && <p className="whitespace-normal break-words text-[11px] text-slate-500 [overflow-wrap:anywhere] dark:text-slate-400">{result.subtitle}</p>}
      </header>
      {result.lines.length > 0 && (
        <dl className="w-full min-w-0 space-y-1">
          {result.lines.map((line, index) => (
            result.kind === "compras" && result.ok ? (
              <div key={`${line.label}-${index}`} className="w-full min-w-0 space-y-1 border-b border-slate-100 py-1 last:border-0 dark:border-slate-800">
                <div className="flex w-full min-w-0 items-start justify-between gap-2">
                  <dt className="min-w-0 whitespace-normal break-words text-slate-500 [overflow-wrap:anywhere] dark:text-slate-400">{line.label}</dt>
                  {line.amount && <dd className="shrink-0 font-semibold text-slate-700 dark:text-slate-200">{line.amount}</dd>}
                </div>
                <dd className="min-w-0 whitespace-normal break-words text-xs leading-relaxed text-slate-600 [overflow-wrap:anywhere] dark:text-slate-300">{line.value}</dd>
              </div>
            ) : (
              <div key={`${line.label}-${index}`} className="flex w-full min-w-0 items-start justify-between gap-3">
                <dt className="min-w-0 flex-1 whitespace-normal break-words text-slate-500 [overflow-wrap:anywhere] dark:text-slate-400">{line.label}</dt>
                <dd className={`min-w-0 flex-1 whitespace-normal break-words text-right font-semibold [overflow-wrap:anywhere] ${TONE[line.tone ?? "muted"]}`}>
                  {line.link ? <a href={line.link} target="_blank" rel="noopener noreferrer" className="inline-flex cursor-pointer items-center gap-1 text-[#002187] hover:underline dark:text-[#C4D600]">Ver anexo<ExternalLink className="h-3 w-3 shrink-0" /></a> : line.value}
                </dd>
              </div>
            )
          ))}
        </dl>
      )}
      {result.candidates && (
        <ul className="space-y-1">
          {result.candidates.map((item) => (
            <li key={item.cpf}>
              <button type="button" onClick={() => onPick(item.cpf, item.name)} className="flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/5">
                <span className="min-w-0 break-words font-semibold [overflow-wrap:anywhere] text-slate-800 dark:text-slate-100">{item.name}</span>
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
type PanelProps = { conversationId: string; tick: number; canInsert: boolean; onInsert: (text: string) => void; onClose: () => void };
const subscribeToMount = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function VmsetCopilotPanel({ isOpen, ...props }: PanelProps & { isOpen: boolean }) {
  const mounted = useSyncExternalStore(subscribeToMount, clientSnapshot, serverSnapshot);
  const panelRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { onClose } = props;

  useEffect(() => {
    if (!isOpen || !mounted) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "Tab" && panel) {
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) {
          event.preventDefault();
          panel.focus();
        } else if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (panel?.contains(document.activeElement)) previousFocus?.focus();
    };
  }, [isOpen, mounted, onClose]);

  if (!mounted) return null;

  const duration = reduceMotion ? 0 : 0.2;
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div key="copilot-overlay" className="fixed inset-0 z-50" initial="closed" animate="open" exit="closed">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            variants={{ closed: { opacity: 0 }, open: { opacity: 1 } }}
            transition={{ duration }}
            onClick={onClose}
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Copiloto VMSet"
            tabIndex={-1}
            className="fixed inset-y-0 right-0 flex w-full max-w-[440px] min-w-0 flex-col overflow-x-hidden border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#07194f]"
            variants={{ closed: { x: "100%" }, open: { x: 0 } }}
            transition={{ duration, ease: "easeOut" }}
          >
            <CopilotContent {...props} />
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function CopilotContent({ conversationId, tick, canInsert, onInsert, onClose }: PanelProps) {
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
      setTurns((list) => [...list, { role: "copilot", text: error instanceof Error ? error.message : "Falha ao responder.", error: true }]);
    } finally {
      setAsking(false);
    }
  };

  const insert = (text: string) => {
    onInsert(text);
    toast.success("Texto na caixa de mensagem", "Revise e envie quando quiser.");
    onClose();
  };

  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Database className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" />Copiloto VMSet</h3>
        <button type="button" onClick={onClose} aria-label="Fechar Copiloto VMSet" title="Fechar" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="w-full min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-3 [scrollbar-gutter:stable]">
        <section className="w-full min-w-0 space-y-2">
          <h4 className="flex min-w-0 items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"><Zap className="h-3.5 w-3.5 shrink-0 text-[#F7915E]" aria-hidden="true" />Sugerido para esta conversa</h4>
          {context && (context.cpfMasked || context.product) && (
            <p className="min-w-0 whitespace-normal break-words text-[11px] text-slate-500 [overflow-wrap:anywhere] dark:text-slate-400">
              {context.cpfMasked && <>CPF {context.cpfMasked} ({context.cpfSource === "chat" ? "do chat" : "do cadastro"})</>}
              {context.cpfMasked && context.product && " · "}
              {context.product && <>Produto: {context.product}</>}
            </p>
          )}
          {suggestions.length ? (
            <div className="space-y-1.5">
              {suggestions.map((item, index) => {
                const Icon = QUERY_ICONS[item.kind];
                return (
                <button key={`${item.kind}-${index}`} type="button" disabled={!!loading} onClick={() => void run(item.kind, item.params as Record<string, string>, `s-${index}`)} className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-[#002187]/15 bg-[#f5f8ff] px-3 py-2 text-left text-xs font-semibold text-[#051647] transition-colors hover:border-[#002187]/40 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-[#051647] dark:text-white">
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 whitespace-normal break-words [overflow-wrap:anywhere]">{item.label}</span>
                  {loading === `s-${index}` && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs italic text-slate-400">{context ? "Nada específico detectado. Use as consultas abaixo." : contextError ?? "Lendo a conversa..."}</p>
          )}
        </section>

        <section className="w-full min-w-0 space-y-2">
          <div role="tablist" aria-label="Consultas rápidas" className="grid w-full min-w-0 grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 min-[380px]:grid-cols-4 dark:bg-white/5">
            {TABS.map((item) => {
              const Icon = QUERY_ICONS[item.id];
              return (
                <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`inline-flex min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 text-[11px] font-semibold transition-colors ${tab === item.id ? "bg-white text-[#051647] shadow-xs dark:bg-[#051647] dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`} title={item.label}>
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
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

      <section aria-label="Chat interno com a IA" className="flex h-[42%] w-full min-h-[220px] min-w-0 shrink-0 flex-col overflow-x-hidden border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-[#051647]/60">
        <p className="flex shrink-0 items-center gap-1.5 px-3 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"><Bot className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Pergunte à IA <span className="font-normal normal-case">(só você vê)</span></p>
        <div className="w-full min-h-0 min-w-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto px-3 py-2">
          {!turns.length && <p className="text-xs italic text-slate-400">Ex.: &quot;Quantas parcelas faltam pra ela?&quot; ou &quot;Qual loja tem o RB3025?&quot;</p>}
          {turns.map((turn, index) => (
            <div key={index} className={`w-full min-w-0 ${turn.role === "operator" ? "flex justify-end" : "space-y-1.5"}`}>
              <p className={`min-w-0 max-w-full overflow-hidden whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-xs [overflow-wrap:anywhere] ${turn.role === "operator" ? "bg-[#002187] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "bg-white text-slate-800 shadow-xs dark:bg-white/10 dark:text-slate-100"}`}>{turn.error && <AlertCircle className="mr-1 inline h-3.5 w-3.5 shrink-0" aria-hidden="true" />}{turn.text}</p>
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
    </>
  );
}
