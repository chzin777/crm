"use client";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { AlertCircle, Check, CheckCheck, Clock, CornerUpLeft, Download, FileIcon, MessageSquare } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { AudioPlayer } from "@/components/chat/AudioPlayer";
import { MediaViewer } from "@/components/chat/MediaViewer";
import { clockTime, dayLabel, fileSize } from "@/lib/chat/format";
import { mergeMessages, replaceMessage } from "@/lib/chat/reconcile";
import type { ChatDelivery, ChatMessageItem } from "@/lib/chat/types";

export type MessageListHandle = {
  add: (message: ChatMessageItem) => void;
  replace: (id: string, message: ChatMessageItem) => void;
  remove: (id: string) => void;
  refresh: () => void;
  holdRefresh: () => void;
  releaseRefresh: () => void;
};

function Delivery({ delivery, reason }: { delivery: ChatDelivery | null; reason: string | null }) {
  if (delivery === "sending") return <Clock className="h-3.5 w-3.5" aria-label="Enviando" />;
  if (delivery === "sent") return <Check className="h-3.5 w-3.5" aria-label="Enviada" />;
  if (delivery === "delivered") return <CheckCheck className="h-3.5 w-3.5" aria-label="Entregue" />;
  if (delivery === "read") return <CheckCheck className="h-3.5 w-3.5 text-[#25D366]" aria-label="Lida" />;
  if (delivery === "failed") return <span title={reason ?? "Falha no envio"}><AlertCircle className="h-3.5 w-3.5 text-red-400" aria-label="Falhou" /></span>;
  return null;
}

const mediaUrl = (message: ChatMessageItem) => message.attachment?.localUrl ?? `/api/chat/media/${message.id}`;

function Attachment({ message, onOpen }: { message: ChatMessageItem; onOpen: () => void }) {
  const attachment = message.attachment!;
  if (attachment.kind === "image" || attachment.kind === "sticker") {
    return (
      <button type="button" onClick={onOpen} aria-label={`Abrir ${attachment.name}`} className="mb-1 block cursor-pointer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaUrl(message)} alt={attachment.name} loading="lazy" className="max-h-64 rounded-lg object-contain" />
      </button>
    );
  }
  if (attachment.kind === "video") return <video src={mediaUrl(message)} controls preload="metadata" className="mb-1 max-h-64 rounded-lg" />;
  if (attachment.kind === "audio") return <AudioPlayer src={mediaUrl(message)} />;
  return (
    <a href={mediaUrl(message)} target="_blank" rel="noreferrer" className="mb-1 flex cursor-pointer items-center gap-2 rounded-lg bg-black/10 p-2 dark:bg-white/10">
      <FileIcon className="h-5 w-5 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{attachment.name}</span>
        <span className="block text-[10px] opacity-70">{fileSize(attachment.size)}</span>
      </span>
      <Download className="h-4 w-4 shrink-0 opacity-70" />
    </a>
  );
}

type Props = {
  conversationId: string;
  tick: number;
  onReply?: (message: ChatMessageItem) => void;
  listRef?: Ref<MessageListHandle>;
};

export function MessageList({ conversationId, tick, onReply, listRef }: Props) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const restoreFrom = useRef<number | null>(null);
  const pendingScroll = useRef<"instant" | "smooth" | null>(null);
  const refreshHolds = useRef(0);
  const refreshDeferred = useRef(false);

  const isNearBottom = () => {
    const box = scroller.current;
    return !box || box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  };

  const merge = useCallback((incoming: ChatMessageItem[]) => {
    setMessages((current) => mergeMessages(current, incoming));
  }, []);

  const fetchLatest = useCallback(async () => {
    const response = await fetch(`/api/chat/conversations/${conversationId}/messages`, { cache: "no-store" });
    if (!response.ok) throw new Error("Falha ao carregar mensagens.");
    return (await response.json()) as { items: ChatMessageItem[]; nextCursor: string | null };
  }, [conversationId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessages([]);
    setCursor(null);
    fetchLatest()
      .then((data) => {
        if (!active) return;
        pendingScroll.current = "instant";
        setMessages(data.items);
        setCursor(data.nextCursor);
      })
      .catch((error) => console.error("[chat]", error))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchLatest]);

  const refresh = useCallback(() => {
    if (refreshHolds.current > 0) {
      refreshDeferred.current = true;
      return;
    }
    fetchLatest()
      .then((data) => {
        if (isNearBottom()) pendingScroll.current = "smooth";
        merge(data.items);
      })
      .catch((error) => console.error("[chat]", error));
  }, [fetchLatest, merge]);

  const firstTick = useRef(tick);
  useEffect(() => {
    if (tick === firstTick.current) return;
    firstTick.current = tick;
    refresh();
  }, [tick, refresh]);

  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box) return;
    if (restoreFrom.current !== null) {
      box.scrollTop += box.scrollHeight - restoreFrom.current;
      restoreFrom.current = null;
    } else if (pendingScroll.current) {
      box.scrollTo({ top: box.scrollHeight, behavior: pendingScroll.current === "smooth" ? "smooth" : "auto" });
    }
    pendingScroll.current = null;
  }, [messages]);

  useImperativeHandle(listRef, () => ({
    add: (message) => {
      pendingScroll.current = "smooth";
      setMessages((current) => [...current, message]);
    },
    replace: (id, message) => setMessages((current) => replaceMessage(current, id, message)),
    remove: (id) => setMessages((current) => current.filter((item) => item.id !== id)),
    refresh,
    holdRefresh: () => {
      refreshHolds.current += 1;
    },
    releaseRefresh: () => {
      refreshHolds.current = Math.max(0, refreshHolds.current - 1);
      if (refreshHolds.current > 0 || !refreshDeferred.current) return;
      refreshDeferred.current = false;
      refresh();
    },
  }), [refresh]);

  const loadOlder = async () => {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const response = await fetch(`/api/chat/conversations/${conversationId}/messages?cursor=${cursor}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { items: ChatMessageItem[]; nextCursor: string | null };
      restoreFrom.current = scroller.current?.scrollHeight ?? null;
      merge(data.items);
      setCursor(data.nextCursor);
    } finally {
      setLoadingOlder(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-0 flex-1 items-center justify-center bg-[#efe7dd]/30 dark:bg-[#0b1a3a]"><LoadingSpinner label="Carregando mensagens..." size={32} /></div>;
  }

  return (
    <div
      ref={scroller}
      onScroll={(event) => {
        if (event.currentTarget.scrollTop < 80) void loadOlder();
      }}
      className="min-h-0 flex-1 overflow-y-auto bg-[#efe7dd]/30 p-4 dark:bg-[#0b1a3a]"
    >
      {messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-slate-500 dark:text-slate-400">
          <MessageSquare className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhuma mensagem nesta conversa</p>
        </div>
      ) : (
        <div className="space-y-3">
          {loadingOlder && <p className="text-center text-xs text-slate-500">Carregando...</p>}
          {messages.map((message, index) => {
            const newDay = index === 0 || dayLabel(messages[index - 1].createdAt) !== dayLabel(message.createdAt);
            const fromUs = message.author === "agent" || message.author === "bot";
            return (
              <div key={message.id} id={`msg-${message.id}`} className="scroll-mt-4">
                {newDay && (
                  <div className="mb-3 flex justify-center">
                    <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-medium text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-300">{dayLabel(message.createdAt)}</span>
                  </div>
                )}
                {message.author === "system" ? (
                  <div className="flex justify-center">
                    <span className="max-w-[85%] rounded-lg bg-slate-200/70 px-3 py-1.5 text-center text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {message.text} · {clockTime(message.createdAt)}
                    </span>
                  </div>
                ) : (
                  <div className={`group flex items-center gap-1 ${fromUs ? "justify-end" : "justify-start"}`}>
                    {fromUs && onReply && !message.internal && (
                      <button type="button" title="Responder" aria-label="Responder" onClick={() => onReply(message)} className="cursor-pointer rounded p-1 text-slate-400 opacity-0 transition-opacity hover:text-slate-600 group-hover:opacity-100 dark:hover:text-slate-200">
                        <CornerUpLeft className="h-4 w-4" />
                      </button>
                    )}
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                        message.internal
                          ? "rounded-br-sm border border-dashed border-[#F7915E] bg-[#F7915E]/15 text-slate-900 dark:text-white"
                          : message.author === "bot"
                            ? "rounded-br-sm bg-[#002187] text-white"
                            : fromUs
                              ? "rounded-br-sm bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]"
                              : "rounded-bl-sm border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      }`}
                    >
                      {(message.internal || message.author === "bot" || (fromUs && message.authorName)) && (
                        <p className="mb-1 text-[10px] font-semibold opacity-80">
                          {message.internal ? `Nota interna · ${message.authorName ?? ""}` : message.authorName ?? "Atendimento automático"}
                        </p>
                      )}
                      {message.replyTo && (
                        <button
                          type="button"
                          onClick={() => message.replyTo?.messageId && document.getElementById(`msg-${message.replyTo.messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                          className="mb-2 block w-full cursor-pointer rounded-lg border-l-4 border-current bg-black/10 px-2 py-1 text-left text-xs dark:bg-white/10"
                        >
                          <span className="block font-semibold opacity-80">{message.replyTo.author}</span>
                          <span className="line-clamp-2 opacity-80">{message.replyTo.text}</span>
                        </button>
                      )}
                      {message.attachment && <Attachment message={message} onOpen={() => setViewing(message.id)} />}
                      {message.text && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>}
                      <div className={`mt-1 flex items-center gap-1 text-[10px] opacity-70 ${fromUs ? "justify-end" : "justify-start"}`}>
                        <span>{clockTime(message.createdAt)}</span>
                        {fromUs && !message.internal && <Delivery delivery={message.delivery} reason={message.failureReason} />}
                      </div>
                      {message.delivery === "failed" && <p className="mt-1 text-[10px] font-medium text-red-300">{message.failureReason ?? "Falha no envio"}</p>}
                    </div>
                    {!fromUs && onReply && (
                      <button type="button" title="Responder" aria-label="Responder" onClick={() => onReply(message)} className="cursor-pointer rounded p-1 text-slate-400 opacity-0 transition-opacity hover:text-slate-600 group-hover:opacity-100 dark:hover:text-slate-200">
                        <CornerUpLeft className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {viewing && (
        <MediaViewer
          startId={viewing}
          onClose={() => setViewing(null)}
          images={messages.filter((message) => message.attachment?.kind === "image" || message.attachment?.kind === "sticker").map((message) => ({ id: message.id, url: mediaUrl(message), name: message.attachment!.name }))}
        />
      )}
    </div>
  );
}
