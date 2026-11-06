"use client";
import { useEffect, useRef, useState } from "react";
import { Lock, Mic, Paperclip, Send, Smile, Square, StickyNote, Trash2, X, Zap } from "lucide-react";
import { TemplatePicker, type TemplateChoice } from "@/components/chat/TemplatePicker";
import { fillVariables } from "@/lib/chat/text";
import type { ChatMessageItem, ConversationDetail } from "@/lib/chat/types";
import { useRecorder } from "@/lib/chat/use-recorder";

export const EMOJIS = [
  "👍", "🙏", "✅", "❌", "⏳", "📦", "🚚", "🧾",
  "😀", "😊", "😉", "🙂", "😅", "🤝", "👏", "💪",
  "😕", "😞", "😡", "❤️", "🔥", "⭐", "📎", "📷",
];

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

const iconButton = "cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800";

export function Composer({ conversation, agentName, canWrite, replyTo, onCancelReply, onSend, onTemplate, onAttach, onError, uploadProgress, error }: Props) {
  const [text, setText] = useState("");
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQuick, setShowQuick] = useState(false);
  const [internal, setInternal] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [sending, setSending] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRecorder(onError);

  const attach = async (file: File) => {
    setSending(true);
    const caption = file.type.startsWith("audio/") ? "" : text.trim();
    if (await onAttach(file, caption)) {
      if (caption) setText("");
    }
    setSending(false);
  };

  const sendRecording = async () => {
    const file = await recorder.finish();
    if (file) await attach(file);
  };

  useEffect(() => {
    const box = field.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 140)}px`;
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
  const term = slashTerm ?? "";
  const quickMatches = quickReplies
    .filter((item) => !item.queueId || item.queueId === conversation.queue?.id)
    .filter((item) => !term || item.title.toLowerCase().includes(term) || item.shortcut.toLowerCase().includes(term));

  const chooseQuick = (item: QuickReply) => {
    setText(fillVariables(item.text, { customer: conversation.name, agent: agentName, queue: conversation.queue?.name }));
    setShowQuick(false);
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

  const insertEmoji = (emoji: string) => {
    const box = field.current;
    const start = box?.selectionStart ?? text.length;
    const end = box?.selectionEnd ?? text.length;
    setText(`${text.slice(0, start)}${emoji}${text.slice(end)}`);
    setShowEmojis(false);
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const footer = "shrink-0 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#07194f]";

  if (!canWrite) return <div className={`${footer} text-center text-xs text-slate-500 dark:text-slate-400`}>Seu perfil pode ver esta conversa, mas não responder.</div>;
  if (conversation.closedAt) return <div className={`${footer} text-center text-xs text-slate-500 dark:text-slate-400`}>Conversa encerrada. Reabra para responder.</div>;

  const blocked = conversation.blocked && !internal;
  const windowClosed = !conversation.windowOpen && !internal;

  return (
    <div className={footer}>
      {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
      {replyTo && !internal && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-l-4 border-[#002187] bg-slate-100 px-3 py-2 dark:border-[#C4D600] dark:bg-slate-800">
          <p className="min-w-0 flex-1 truncate text-xs text-slate-600 dark:text-slate-300">{replyTo.text || "Anexo"}</p>
          <button type="button" onClick={onCancelReply} aria-label="Cancelar citação" title="Cancelar citação" className="cursor-pointer text-slate-500 hover:text-slate-800 dark:hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      )}
      {showEmojis && (
        <div className="mb-2 grid w-fit grid-cols-8 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          {EMOJIS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="h-8 w-8 cursor-pointer rounded-lg text-lg hover:bg-slate-100 dark:hover:bg-slate-700">{emoji}</button>
          ))}
        </div>
      )}
      {quickVisible && !blocked && !windowClosed && (
        <div className="mb-2 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          {quickMatches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Nenhuma resposta pronta encontrada.</p>
          ) : quickMatches.map((item) => (
            <button key={item.id} type="button" onClick={() => chooseQuick(item)} className="block w-full cursor-pointer px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700">
              <span className="block text-xs font-semibold text-slate-900 dark:text-white">{item.title}{item.shortcut ? ` · /${item.shortcut}` : ""}</span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{item.text}</span>
            </button>
          ))}
        </div>
      )}
      {blocked ? (
        <p className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Lock className="h-4 w-4 shrink-0" />Este número está bloqueado e não recebe mensagens. Você ainda pode registrar notas internas.</p>
      ) : windowClosed ? (
        <TemplatePicker onSend={onTemplate} />
      ) : recorder.recording ? (
        <div className="flex items-center gap-3 rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">Gravando {Math.floor(recorder.seconds / 60)}:{String(recorder.seconds % 60).padStart(2, "0")}</span>
          <button type="button" onClick={recorder.discard} title="Descartar" aria-label="Descartar gravação" className={iconButton}><Trash2 className="h-5 w-5" /></button>
          <button type="button" onClick={() => void sendRecording()} title="Parar e enviar" aria-label="Parar e enviar" className="cursor-pointer rounded-lg bg-[#051647] p-2.5 text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]"><Square className="h-5 w-5" /></button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <button type="button" title="Emojis" aria-label="Emojis" onClick={() => setShowEmojis((value) => !value)} className={iconButton}><Smile className="h-5 w-5" /></button>
          <button type="button" title="Respostas prontas" aria-label="Respostas prontas" onClick={() => setShowQuick((value) => !value)} className={iconButton}><Zap className="h-5 w-5" /></button>
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
              <button type="button" title="Anexar arquivo" aria-label="Anexar arquivo" disabled={sending} onClick={() => fileInput.current?.click()} className={iconButton}><Paperclip className="h-5 w-5" /></button>
            </>
          )}
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
            className={`min-h-10 flex-1 resize-none rounded-lg border px-4 py-2 text-sm outline-none transition-colors focus:border-[#002187] dark:text-white dark:focus:border-[#C4D600] ${internal ? "border-[#F7915E] bg-[#F7915E]/10" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"}`}
          />
          {text.trim() || internal ? (
            <button type="button" title="Enviar" aria-label="Enviar" onClick={() => void submit()} disabled={!text.trim() || sending} className="cursor-pointer rounded-lg bg-[#051647] p-2.5 text-white transition-colors hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#b3c400]">
              <Send className="h-5 w-5" />
            </button>
          ) : (
            <button type="button" title="Gravar áudio" aria-label="Gravar áudio" disabled={sending} onClick={() => void recorder.start()} className={iconButton}><Mic className="h-5 w-5" /></button>
          )}
        </div>
      )}
      {uploadProgress !== null && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-label="Envio do arquivo" aria-valuenow={uploadProgress}>
          <div className="h-full bg-[#002187] transition-all dark:bg-[#C4D600]" style={{ width: `${uploadProgress}%` }} />
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => setInternal((value) => !value)} className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${internal ? "bg-[#F7915E]/20 text-[#b4531f] dark:text-[#F7915E]" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"}`}>
          <StickyNote className="h-3.5 w-3.5" />Nota interna
        </button>
      </div>
    </div>
  );
}
