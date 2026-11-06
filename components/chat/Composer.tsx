"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FileText, Image as ImageIcon, Lock, Mic, Paperclip, Search, Send, Smile, StickyNote, Trash2, X, Zap } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ComposerPopover } from "@/components/chat/ComposerPopover";
import { FloatingMenu } from "@/components/chat/FloatingMenu";
import { TemplatePicker, type TemplateChoice } from "@/components/chat/TemplatePicker";
import { fillVariables } from "@/lib/chat/text";
import type { ChatMessageItem, ConversationDetail } from "@/lib/chat/types";
import { useRecorder } from "@/lib/chat/use-recorder";

// A biblioteca e a base de emojis só são baixadas quando o seletor abre.
const EmojiPanel = dynamic(() => import("@/components/chat/EmojiPanel").then((module) => module.EmojiPanel), {
  ssr: false,
  loading: () => <div className="grid h-[400px] w-[340px] max-w-full place-items-center"><LoadingSpinner label="Carregando emojis..." size={32} /></div>,
});

export type ComposerSend = { text: string; internal: boolean; replyTo: ChatMessageItem | null };

type QuickReply = { id: string; title: string; text: string; shortcut: string; queueId: string | null };

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
};

const MAX_FIELD_HEIGHT = 128;
const MEDIA_ACCEPT = "image/jpeg,image/png,video/mp4";
const WAVE_BARS = Array.from({ length: 18 }, (_, index) => index);

const toolButton = "grid h-[42px] w-9 shrink-0 cursor-pointer place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/10";
const roundButton = "grid h-[42px] w-[42px] shrink-0 cursor-pointer place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function Composer({ conversation, agentName, canWrite, replyTo, onCancelReply, onSend, onTemplate, onAttach, onError, uploadProgress, error }: Props) {
  const [text, setText] = useState("");
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQuick, setShowQuick] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const [internal, setInternal] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [sending, setSending] = useState(false);
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

  useEffect(() => {
    let active = true;
    fetch("/api/chat/quick-replies")
      .then(async (response) => {
        if (response.ok && active) setQuickReplies(((await response.json()) as { data: QuickReply[] }).data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const slashTerm = text.startsWith("/") ? text.slice(1).toLowerCase() : null;
  const quickVisible = showQuick || slashTerm !== null;
  const term = slashTerm ?? quickSearch.trim().toLowerCase();
  const quickMatches = quickReplies
    .filter((item) => !item.queueId || item.queueId === conversation.queue?.id)
    .filter((item) => !term || item.title.toLowerCase().includes(term) || item.shortcut.toLowerCase().includes(term) || item.text.toLowerCase().includes(term));

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
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setText("");
    const sent = await onSend({ text: value, internal, replyTo });
    if (!sent) setText(value);
    setSending(false);
  };

  const footer = "shrink-0 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#07194f]";

  if (!canWrite) return <div className={`${footer} text-center text-xs text-slate-500 dark:text-slate-400`}>Seu perfil pode ver esta conversa, mas não responder.</div>;
  if (conversation.closedAt) return <div className={`${footer} text-center text-xs text-slate-500 dark:text-slate-400`}>Conversa encerrada. Reabra para responder.</div>;

  const blocked = conversation.blocked && !internal;
  const windowClosed = !conversation.windowOpen && !internal;
  const typing = !blocked && !windowClosed && !recorder.recording;

  return (
    <div className={footer}>
      {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
      {replyTo && !internal && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-l-4 border-[#002187] bg-slate-100 px-3 py-2 dark:border-[#C4D600] dark:bg-slate-800">
          <p className="min-w-0 flex-1 truncate text-xs text-slate-600 dark:text-slate-300">{replyTo.text || "Anexo"}</p>
          <button type="button" onClick={onCancelReply} aria-label="Cancelar citação" title="Cancelar citação" className="cursor-pointer text-slate-500 hover:text-slate-800 dark:hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      )}
      {showEmojis && typing && (
        <ComposerPopover anchor={emojiButton} label="Emojis" onClose={closeEmojis}>
          <EmojiPanel onPick={insertAtCursor} />
        </ComposerPopover>
      )}
      {quickVisible && typing && (
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
                <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Nenhuma resposta pronta encontrada.</p>
              ) : quickMatches.map((item) => (
                <button key={item.id} type="button" onClick={() => chooseQuick(item)} className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-white/10">
                  <span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{item.title}{item.shortcut ? ` · /${item.shortcut}` : ""}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{item.text}</span>
                </button>
              ))}
            </div>
          </div>
        </ComposerPopover>
      )}
      {blocked ? (
        <p className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Lock className="h-4 w-4 shrink-0" />Este número está bloqueado e não recebe mensagens. Você ainda pode registrar notas internas.</p>
      ) : windowClosed ? (
        <TemplatePicker onSend={onTemplate} />
      ) : recorder.recording ? (
        <div className="flex items-end gap-2">
          <button type="button" onClick={recorder.discard} title="Descartar" aria-label="Descartar gravação" className={`${roundButton} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15`}><Trash2 className="h-5 w-5" /></button>
          <div className="flex h-[42px] min-w-0 flex-1 items-center gap-3 rounded-2xl bg-slate-100 px-4 dark:bg-slate-800/80">
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
            <span role="timer" aria-label="Tempo de gravação" className="shrink-0 text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">{Math.floor(recorder.seconds / 60)}:{String(recorder.seconds % 60).padStart(2, "0")}</span>
            <span aria-hidden="true" className="recording-wave flex h-5 min-w-0 flex-1 items-center justify-center gap-0.5 overflow-hidden text-emerald-600 dark:text-[#C4D600]">
              {WAVE_BARS.map((bar) => <span key={bar} style={{ animationDelay: `${(bar * 0.13) % 1.1}s` }} />)}
            </span>
          </div>
          <button type="button" onClick={() => void sendRecording()} title="Parar e enviar" aria-label="Parar e enviar" className={`${roundButton} bg-emerald-600 text-white hover:bg-emerald-700`}><Check className="h-5 w-5" /></button>
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
            <button type="button" title="Nota interna" aria-label="Nota interna" aria-pressed={internal} onClick={() => setInternal((value) => !value)} className={internal ? `${toolButton} bg-[#F7915E]/20 text-[#b4531f] hover:bg-[#F7915E]/30 dark:text-[#F7915E] dark:hover:bg-[#F7915E]/30` : toolButton}><StickyNote className="h-5 w-5" /></button>
          </div>
          <textarea
            ref={field}
            rows={1}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={internal ? "Nota interna, o cliente não vê..." : "Digite uma mensagem..."}
            className={`max-h-32 min-h-[42px] min-w-0 flex-1 resize-none overflow-y-auto scroll-smooth rounded-2xl px-4 py-[11px] text-sm leading-5 text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:ring-1 focus:ring-[#002187]/30 dark:text-white dark:focus:ring-[#C4D600]/40 ${internal ? "bg-[#F7915E]/15!" : "bg-slate-100 dark:bg-slate-800/80!"}`}
          />
          {text.trim() || internal ? (
            <button type="button" title="Enviar" aria-label="Enviar" onClick={() => void submit()} disabled={!text.trim() || sending} className={`${roundButton} bg-[#25D366] text-[#051647] hover:bg-[#1ebe5b] dark:bg-[#C4D600] dark:hover:bg-[#b3c400]`}>
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
      {(blocked || windowClosed) && (
        <div className="mt-2 flex items-center gap-2">
          <button type="button" onClick={() => setInternal(true)} className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
            <StickyNote className="h-3.5 w-3.5" />Nota interna
          </button>
        </div>
      )}
    </div>
  );
}
