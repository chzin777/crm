"use client";
import { useEffect, useRef, useState } from "react";
import { Lock, Send, Smile, StickyNote, X } from "lucide-react";
import { TemplatePicker, type TemplateChoice } from "@/components/chat/TemplatePicker";
import type { ChatMessageItem, ConversationDetail } from "@/lib/chat/types";

export const EMOJIS = [
  "👍", "🙏", "✅", "❌", "⏳", "📦", "🚚", "🧾",
  "😀", "😊", "😉", "🙂", "😅", "🤝", "👏", "💪",
  "😕", "😞", "😡", "❤️", "🔥", "⭐", "📎", "📷",
];

export type ComposerSend = { text: string; internal: boolean; replyTo: ChatMessageItem | null };

type Props = {
  conversation: ConversationDetail;
  canWrite: boolean;
  replyTo: ChatMessageItem | null;
  onCancelReply: () => void;
  onSend: (message: ComposerSend) => Promise<boolean>;
  onTemplate: (template: TemplateChoice) => Promise<void>;
  error: string;
  children?: React.ReactNode;
};

const iconButton = "cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800";

export function Composer({ conversation, canWrite, replyTo, onCancelReply, onSend, onTemplate, error, children }: Props) {
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [sending, setSending] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const box = field.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 140)}px`;
  }, [text]);

  useEffect(() => {
    if (replyTo) field.current?.focus();
  }, [replyTo]);

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
      {blocked ? (
        <p className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Lock className="h-4 w-4 shrink-0" />Este número está bloqueado e não recebe mensagens. Você ainda pode registrar notas internas.</p>
      ) : windowClosed ? (
        <TemplatePicker onSend={onTemplate} />
      ) : (
        <div className="flex items-end gap-2">
          <button type="button" title="Emojis" aria-label="Emojis" onClick={() => setShowEmojis((value) => !value)} className={iconButton}><Smile className="h-5 w-5" /></button>
          {!internal && children}
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
          <button type="button" title="Enviar" aria-label="Enviar" onClick={() => void submit()} disabled={!text.trim() || sending} className="cursor-pointer rounded-lg bg-[#051647] p-2.5 text-white transition-colors hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#b3c400]">
            <Send className="h-5 w-5" />
          </button>
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
