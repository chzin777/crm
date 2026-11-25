"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from "react";
import { typingAllowed } from "@/lib/chat/typing";
import { CalendarClock, Check, FileText, Image as ImageIcon, Loader2, Lock, Mic, Paperclip, Search, Send, Smile, Sparkles, StickyNote, Trash2, X, Zap } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ComposerPopover } from "@/components/chat/ComposerPopover";
import { FloatingMenu } from "@/components/chat/FloatingMenu";
import { ScheduleMessageDialog } from "@/components/chat/ScheduleDialogs";
import { TemplatePicker, type TemplateChoice } from "@/components/chat/TemplatePicker";
import { fillVariables } from "@/lib/chat/text";
import type { ChatMessageItem, ConversationDetail } from "@/lib/chat/types";
import { useRecorder } from "@/lib/chat/use-recorder";
import { extractClipboardImages } from "@/lib/clipboard";
import { MAX_IMAGE_BYTES } from "@/lib/chat/media-rules";
import { useToast } from "@/components/ToastProvider";
import Link from "next/link";
import { Plus, Settings2 } from "lucide-react";
import { QuickReplyDialog } from "@/components/chat/QuickReplyDialog";
import { matchesQuickReply, type QuickReply as FullQuickReply } from "@/lib/chat/quick-replies";

// A biblioteca e a base de emojis só são baixadas quando o seletor abre.
const EmojiPanel = dynamic(() => import("@/components/chat/EmojiPanel").then((module) => module.EmojiPanel), {
  ssr: false,
  loading: () => <div className="grid h-[400px] w-[340px] max-w-full place-items-center"><LoadingSpinner label="Carregando emojis..." size={32} /></div>,
});

export type ComposerSend = { text: string; internal: boolean; replyTo: ChatMessageItem | null };

type QuickReply = Pick<FullQuickReply, "id" | "title" | "text" | "shortcut" | "queueId" | "category">;

type Props = {
  conversation: ConversationDetail;
  agentName: string;
  canWrite: boolean;
  replyTo: ChatMessageItem | null;
  onCancelReply: () => void;
  onSend: (message: ComposerSend) => Promise<boolean>;
  onTemplate: (template: TemplateChoice) => Promise<void>;
  onAttach: (file: File, caption: string) => Promise<boolean>;
  onError: (message: string) => void;
  uploadProgress: number | null;
  error: string;
  /** Com ele, aparece "Agendar envio" ao lado de Enviar; chamado depois de agendar. */
  onScheduled?: () => void;
  /** Texto vindo de fora (ex.: oferta sugerida pela IA no painel do cliente); nonce muda a cada pedido. */
  draft?: { text: string; nonce: number; append?: boolean } | null;
};

const MAX_FIELD_HEIGHT = 128;
const MEDIA_ACCEPT = "image/jpeg,image/png,video/mp4";
const WAVE_BARS = Array.from({ length: 18 }, (_, index) => index);

const toolButton = "grid h-[42px] w-9 shrink-0 cursor-pointer place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/10";
const roundButton = "grid h-[42px] w-[42px] shrink-0 cursor-pointer place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function Composer({ conversation, agentName, canWrite, replyTo, onCancelReply, onSend, onTemplate, onAttach, onError, uploadProgress, error, onScheduled, draft }: Props) {
  const [text, setText] = useState("");
  // "digitando..." no WhatsApp do cliente enquanto o atendente escreve: no máximo 1 chamada a cada 15 s.
  const lastTyping = useRef(0);
  const signalTyping = (value: string) => {
    if (!canWrite || internal || !conversation.windowOpen || !value.trim() || value.startsWith("/")) return;
    const now = Date.now();
    if (!typingAllowed(lastTyping.current, now)) return;
    lastTyping.current = now;
    void fetch("/api/chat/typing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: conversation.id }) }).catch(() => undefined);
  };
  const [suggesting, setSuggesting] = useState(false);
  /** Sugestão do copiloto aguardando decisão do atendente (presa à conversa em que foi pedida). */
  const [suggestion, setSuggestion] = useState<{ conversationId: string; text: string } | null>(null);
  /** Sugestão colocada no campo: ao enviar, o texto final volta como correção silenciosa para o copiloto aprender. */
  const usedSuggestion = useRef<{ conversationId: string; text: string } | null>(null);
  /** Texto congelado ao abrir "Agendar envio"; null enquanto o diálogo está fechado. */
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQuick, setShowQuick] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  // Criar resposta rápida sem sair da conversa (modal próprio; a lista do popover é recarregada ao salvar).
  const [creatingQuick, setCreatingQuick] = useState(false);
  const [canManageTeamReplies, setCanManageTeamReplies] = useState(false);
  const [quickReload, setQuickReload] = useState(0);
  const [internal, setInternal] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [sending, setSending] = useState(false);
  /** Imagem colada (Ctrl+V): fica em prévia até o Enviar, com o texto do campo como legenda. */
  const [pasted, setPasted] = useState<{ file: File; url: string } | null>(null);
  const toast = useToast();
  const field = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const emojiButton = useRef<HTMLButtonElement>(null);
  const quickButton = useRef<HTMLButtonElement>(null);
  const recorder = useRecorder(onError);

  const closeEmojis = useCallback(() => setShowEmojis(false), []);
  const closeQuick = useCallback(() => {
    setShowQuick(false);
    setQuickSearch("");
  }, []);

  const attach = async (file: File) => {
    setSending(true);
    const caption = file.type.startsWith("audio/") ? "" : text.trim();
    if (await onAttach(file, caption)) {
      if (caption) setText("");
    }
    setSending(false);
  };

  const clearPasted = useCallback(() => {
    setPasted((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);
  useEffect(() => clearPasted, [clearPasted]);

  /** Ctrl+V com imagem (print, foto copiada): abre a prévia. Só texto: o colar normal segue. */
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (internal) return;
    const images = extractClipboardImages(event.clipboardData);
    if (!images.length) return;
    event.preventDefault();
    const image = images[0];
    if (image.size > MAX_IMAGE_BYTES) {
      toast.error(`A imagem colada tem ${(image.size / 1024 / 1024).toFixed(1)} MB; o WhatsApp aceita imagens até 5 MB.`);
      return;
    }
    if (images.length > 1) toast.success("Imagem colada", "Só a primeira imagem foi anexada.");
    clearPasted();
    setPasted({ file: image, url: URL.createObjectURL(image) });
  };

  const pickFile = (accept: string) => {
    const input = fileInput.current;
    if (!input || sending) return;
    input.accept = accept;
    input.click();
  };

  const sendRecording = async () => {
    const file = await recorder.finish();
    if (file) await attach(file);
  };

  useEffect(() => {
    const box = field.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, MAX_FIELD_HEIGHT)}px`;
  }, [text]);

  useEffect(() => {
    if (replyTo) field.current?.focus();
  }, [replyTo]);

  // Só aplica pedidos feitos depois de montar: trocar de conversa não pode herdar a oferta da anterior.
  const appliedDraft = useRef(draft?.nonce);
  useEffect(() => {
    if (!draft?.text || draft.nonce === appliedDraft.current) return;
    appliedDraft.current = draft.nonce;
    // "Jogar na mensagem" do Copiloto VMSet anexa ao que já foi digitado; as outras ofertas substituem.
    setText((current) => (draft.append && current.trim() ? `${current.trimEnd()}\n\n${draft.text}` : draft.text));
    requestAnimationFrame(() => field.current?.focus());
  }, [draft]);

  /**
   * Copiloto de resposta: a IA sugere, o atendente revisa. A sugestão aparece num cartão acima do campo (o que já foi
   * digitado fica intacto); "Usar no campo" só preenche o texto. Nada é enviado sem o atendente clicar em Enviar/Enter.
   */
  const suggestReply = async () => {
    if (suggesting) return;
    const conversationId = conversation.id;
    setSuggesting(true);
    try {
      const response = await fetch(`/api/chat/conversas/${conversationId}/sugerir-resposta`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (!response.ok || !data.reply?.trim()) toast.error("Não foi possível sugerir uma resposta", data.error ?? "Tente novamente em instantes.");
      else setSuggestion({ conversationId, text: data.reply.trim() });
    } catch {
      toast.error("Não foi possível falar com a IA", "Verifique a conexão e tente novamente.");
    } finally {
      setSuggesting(false);
    }
  };
  const applySuggestion = (value: string) => {
    usedSuggestion.current = { conversationId: conversation.id, text: value };
    setText(value);
    setSuggestion(null);
    requestAnimationFrame(() => {
      const element = field.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(value.length, value.length);
    });
  };
  // Sugestão de outra conversa nunca aparece aqui (o operador pode trocar de conversa enquanto a IA gera).
  const visibleSuggestion = suggestion && suggestion.conversationId === conversation.id ? suggestion.text : null;

  useEffect(() => {
    let active = true;
    fetch("/api/chat/quick-replies", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok || !active) return;
        const result = (await response.json()) as { data: QuickReply[]; canManageTeam?: boolean };
        setQuickReplies(result.data);
        setCanManageTeamReplies(!!result.canManageTeam);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [quickReload]);

  const slashTerm = text.startsWith("/") ? text.slice(1).toLowerCase() : null;
  const quickVisible = showQuick || slashTerm !== null;
  const term = slashTerm ?? quickSearch.trim().toLowerCase();
  const quickMatches = quickReplies
    .filter((item) => !item.queueId || item.queueId === conversation.queue?.id)
    .filter((item) => !term || matchesQuickReply(item, term))
    // Atalho que começa com o que foi digitado vem primeiro ("/pi" → /pix).
    .sort((a, b) => Number(!!term && b.shortcut.toLowerCase().startsWith(term)) - Number(!!term && a.shortcut.toLowerCase().startsWith(term)));

  const insertAtCursor = (value: string) => {
    const box = field.current;
    const start = box?.selectionStart ?? text.length;
    const end = box?.selectionEnd ?? text.length;
    setText((current) => `${current.slice(0, start)}${value}${current.slice(end)}`);
    requestAnimationFrame(() => box?.setSelectionRange(start + value.length, start + value.length));
  };

  const chooseQuick = (item: QuickReply) => {
    const filled = fillVariables(item.text, { customer: conversation.name, agent: agentName, queue: conversation.queue?.name });
    if (slashTerm !== null) setText(filled);
    else insertAtCursor(filled);
    closeQuick();
    field.current?.focus();
  };

  const submit = async () => {
    if (pasted && !internal) {
      if (sending) return;
      const file = pasted.file;
      clearPasted();
      await attach(file);
      return;
    }
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setText("");
    const sent = await onSend({ text: value, internal, replyTo });
    if (!sent) setText(value);
    const used = usedSuggestion.current;
    if (sent && used) {
      usedSuggestion.current = null;
      // Só conta como correção se foi ao cliente nesta conversa; o servidor ignora quando o texto não mudou.
      if (!internal && used.conversationId === conversation.id) {
        void fetch(`/api/chat/conversas/${used.conversationId}/sugerir-resposta/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ suggestion: used.text, sent: value }) }).catch(() => undefined);
      }
    }
    setSending(false);
  };

  const footer = "shrink-0 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#07194f]";

  if (!canWrite) return <div className={`${footer} text-center text-xs text-slate-500 dark:text-slate-400`}>Seu perfil pode ver esta conversa, mas não responder.</div>;
  if (conversation.closedAt) return <div className={`${footer} text-center text-xs text-slate-500 dark:text-slate-400`}>Conversa encerrada. Reabra para responder.</div>;

  const blocked = conversation.blocked && !internal;
  const windowClosed = !conversation.windowOpen && !internal;
  const typing = !blocked && !windowClosed && !recorder.recording;

  const modeButton = (active: boolean, note: boolean) => `inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${
    active
      ? note ? "bg-[#F7915E]/20 text-[#b4531f] dark:text-[#F7915E]" : "bg-white text-[#051647] shadow-xs dark:bg-white/10 dark:text-white"
      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
  }`;

  return (
    <div className={footer}>
      {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
      {!recorder.recording && (
        <div role="tablist" aria-label="Tipo de envio" className="mb-2 inline-flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-white/[0.04]">
          <button type="button" role="tab" aria-selected={!internal} onClick={() => setInternal(false)} className={modeButton(!internal, false)}>
            <Send className="h-3.5 w-3.5" />Mensagem
          </button>
          <button type="button" role="tab" aria-selected={internal} onClick={() => setInternal(true)} className={modeButton(internal, true)}>
            <StickyNote className="h-3.5 w-3.5" />Nota interna
          </button>
        </div>
      )}
      {replyTo && !internal && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-l-4 border-[#002187] bg-slate-100 px-3 py-2 dark:border-[#C4D600] dark:bg-slate-800">
          <p className="min-w-0 flex-1 truncate text-xs text-slate-600 dark:text-slate-300">{replyTo.text || "Anexo"}</p>
          <button type="button" onClick={onCancelReply} aria-label="Cancelar citação" title="Cancelar citação" className="cursor-pointer text-slate-500 hover:text-slate-800 dark:hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      )}
      {pasted && !internal && typing && (
        <div className="mb-2 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800">
          <img src={pasted.url} alt="Imagem colada" className="h-14 w-14 shrink-0 rounded-md object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{pasted.file.name}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{(pasted.file.size / 1024).toFixed(0)} KB · o texto do campo vai como legenda</p>
          </div>
          <button type="button" onClick={clearPasted} aria-label="Remover imagem colada" title="Remover imagem" className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
      )}
      {showEmojis && typing && (
        <ComposerPopover anchor={emojiButton} label="Emojis" onClose={closeEmojis}>
          <EmojiPanel onPick={insertAtCursor} />
        </ComposerPopover>
      )}
      {quickVisible && typing && !creatingQuick && (
        <ComposerPopover anchor={quickButton} label="Respostas prontas" onClose={closeQuick}>
          <div className="w-80 max-w-full">
            {slashTerm === null && (
              <div className="flex items-center gap-2 border-b border-slate-200 px-3 dark:border-slate-800">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  autoFocus
                  value={quickSearch}
                  onChange={(event) => setQuickSearch(event.target.value)}
                  placeholder="Buscar resposta pronta"
                  aria-label="Buscar resposta pronta"
                  className="h-10 min-w-0 flex-1 bg-transparent! text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
                />
              </div>
            )}
            <div className="max-h-60 overflow-y-auto p-1">
              {quickMatches.length === 0 ? (
                <div className="px-3 py-3 text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{quickReplies.length === 0 ? "Nenhuma resposta rápida cadastrada ainda." : "Nenhuma resposta rápida encontrada."}</p>
                  <button type="button" onClick={() => { closeQuick(); setCreatingQuick(true); }} className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#051647] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]">
                    <Plus className="h-3.5 w-3.5" /> Nova resposta rápida
                  </button>
                </div>
              ) : quickMatches.map((item) => (
                <button key={item.id} type="button" onClick={() => chooseQuick(item)} className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-white/10">
                  <span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{item.title}{item.shortcut ? ` · /${item.shortcut}` : ""}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{item.text}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-2 py-1.5 dark:border-slate-800">
              <button type="button" onClick={() => { closeQuick(); setCreatingQuick(true); }} className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#002187] hover:bg-slate-100 dark:text-[#C4D600] dark:hover:bg-white/10">
                <Plus className="h-3.5 w-3.5" /> Nova resposta rápida
              </button>
              <Link href="/respostas-rapidas" target="_blank" rel="noopener noreferrer" onClick={closeQuick} className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white">
                <Settings2 className="h-3.5 w-3.5" /> Gerenciar todas
              </Link>
            </div>
          </div>
        </ComposerPopover>
      )}
      {!blocked && !windowClosed && (suggesting || visibleSuggestion) && (
        <div role="status" aria-live="polite" className="mb-2 rounded-xl border border-[#002187]/20 bg-[#002187]/5 p-3 dark:border-[#C4D600]/25 dark:bg-[#C4D600]/10">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#002187] dark:text-[#C4D600]">
            {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {suggesting ? "Gerando sugestão..." : "Sugestão da IA · revise antes de enviar"}
          </p>
          {visibleSuggestion && (
            <>
              <p className="mt-1.5 max-h-40 min-w-0 overflow-y-auto whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-100">{visibleSuggestion}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => applySuggestion(visibleSuggestion)} disabled={suggesting} className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-[#051647] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#002187] disabled:cursor-wait disabled:opacity-60 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#b3c400]">
                  <Check className="h-3.5 w-3.5" /> Usar no campo
                </button>
                <button type="button" onClick={() => void suggestReply()} disabled={suggesting} className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white disabled:cursor-wait disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-white/10">
                  <Sparkles className="h-3.5 w-3.5" /> Gerar outra
                </button>
                <button type="button" onClick={() => setSuggestion(null)} disabled={suggesting} className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white hover:text-slate-800 disabled:cursor-wait disabled:opacity-60 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white">
                  <X className="h-3.5 w-3.5" /> Descartar
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {blocked ? (
        <p className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Lock className="h-4 w-4 shrink-0" />Este número está bloqueado e não recebe mensagens. Você ainda pode registrar notas internas.</p>
      ) : windowClosed ? (
        <TemplatePicker onSend={onTemplate} customerName={conversation.name} agentName={agentName} conversationId={conversation.id} storeName={conversation.store} />
      ) : recorder.recording ? (
        <div className="flex items-end gap-2">
          <button type="button" onClick={recorder.discard} title="Descartar" aria-label="Descartar gravação" className={`${roundButton} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15`}><Trash2 className="h-5 w-5" /></button>
          <div className="flex h-[42px] min-w-0 flex-1 items-center gap-3 rounded-2xl bg-slate-100 px-4 dark:bg-slate-800/80">
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
            <span role="timer" aria-label="Tempo de gravação" className="shrink-0 text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">{Math.floor(recorder.seconds / 60)}:{String(recorder.seconds % 60).padStart(2, "0")}</span>
            <span aria-hidden="true" className="recording-wave flex h-5 min-w-0 flex-1 items-center justify-center gap-0.5 overflow-hidden text-[#C4D600]">
              {WAVE_BARS.map((bar) => <span key={bar} style={{ animationDelay: `${(bar * 0.13) % 1.1}s` }} />)}
            </span>
          </div>
          <button type="button" onClick={() => void sendRecording()} title="Parar e enviar" aria-label="Parar e enviar" className={`${roundButton} bg-[#C4D600] text-[#051647] hover:bg-[#b3c400]`}><Check className="h-5 w-5" /></button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex shrink-0 items-end">
            <button ref={emojiButton} type="button" title="Emojis" aria-label="Emojis" aria-expanded={showEmojis} onClick={() => setShowEmojis((value) => !value)} className={toolButton}><Smile className="h-5 w-5" /></button>
            <button ref={quickButton} type="button" title="Respostas prontas" aria-label="Respostas prontas" aria-expanded={quickVisible} onClick={() => (showQuick ? closeQuick() : setShowQuick(true))} className={toolButton}><Zap className="h-5 w-5" /></button>
            {!internal && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  aria-label="Anexar arquivo"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void attach(file);
                  }}
                />
                <FloatingMenu
                  label="Anexar arquivo"
                  align="left"
                  widthClassName="w-52"
                  triggerClassName={toolButton}
                  trigger={<Paperclip className="h-5 w-5" />}
                  items={[
                    { label: "Imagem ou vídeo", icon: <ImageIcon className="h-4 w-4" />, onSelect: () => pickFile(MEDIA_ACCEPT) },
                    { label: "Documento ou PDF", icon: <FileText className="h-4 w-4" />, onSelect: () => pickFile("") },
                  ]}
                />
              </>
            )}
            {!internal && (
              <button type="button" title={suggesting ? "Gerando sugestão..." : "Sugerir resposta com IA"} aria-label={suggesting ? "Gerando sugestão..." : "Sugerir resposta com IA"} aria-busy={suggesting} disabled={suggesting} onClick={() => void suggestReply()} className={`${toolButton} text-[#002187] disabled:cursor-wait disabled:opacity-70 dark:text-[#C4D600]`}>
                {suggesting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              </button>
            )}
          </div>
          <textarea
            ref={field}
            rows={1}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              signalTyping(event.target.value);
            }}
            onPaste={onPaste}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={internal ? "Nota interna, o cliente não vê..." : pasted ? "Legenda da imagem (opcional) e Enter..." : "Digite uma mensagem ou cole uma imagem (Ctrl+V)..."}
            className={`max-h-32 min-h-[42px] min-w-0 flex-1 resize-none overflow-y-auto scroll-smooth rounded-2xl px-4 py-[11px] text-sm leading-5 text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:ring-1 focus:ring-[#002187]/30 dark:text-white dark:focus:ring-[#C4D600]/40 ${internal ? "bg-[#F7915E]/15!" : "bg-slate-100 dark:bg-slate-800/80!"}`}
          />
          {text.trim() && !internal && onScheduled && (
            <button type="button" title="Agendar envio" aria-label="Agendar envio" onClick={() => setScheduling(text.trim())} disabled={sending} className={`${roundButton} text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10`}>
              <CalendarClock className="h-5 w-5" />
            </button>
          )}
          {text.trim() || internal || pasted ? (
            <button type="button" title="Enviar" aria-label="Enviar" onClick={() => void submit()} disabled={(!text.trim() && !(pasted && !internal)) || sending} className={`${roundButton} bg-[#C4D600] text-[#051647] hover:bg-[#b3c400]`}>
              <Send className="h-5 w-5" />
            </button>
          ) : (
            <button type="button" title="Gravar áudio" aria-label="Gravar áudio" disabled={sending} onClick={() => void recorder.start()} className={`${roundButton} text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10`}><Mic className="h-5 w-5" /></button>
          )}
        </div>
      )}
      {uploadProgress !== null && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-label="Envio do arquivo" aria-valuenow={uploadProgress}>
          <div className="h-full bg-[#002187] transition-all dark:bg-[#C4D600]" style={{ width: `${uploadProgress}%` }} />
        </div>
      )}
      {creatingQuick && (
        <QuickReplyDialog
          canManageTeam={canManageTeamReplies}
          onClose={() => setCreatingQuick(false)}
          onSaved={(item) => {
            setCreatingQuick(false);
            // Lista atualizada na hora e o popover reabre já filtrado na nova resposta, pronta para inserir.
            setQuickReplies((current) => [...current.filter((reply) => reply.id !== item.id), item].sort((a, b) => a.title.localeCompare(b.title, "pt-BR")));
            setQuickReload((value) => value + 1);
            setQuickSearch(item.shortcut || item.title);
            setShowQuick(true);
          }}
        />
      )}
      {scheduling !== null && onScheduled && (
        <ScheduleMessageDialog
          conversationId={conversation.id}
          text={scheduling}
          onClose={() => setScheduling(null)}
          onSaved={() => {
            setScheduling(null);
            setText("");
            onScheduled();
          }}
        />
      )}
    </div>
  );
}
