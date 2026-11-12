"use client";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { AlertCircle, Check, CheckCheck, Clock, CornerUpLeft, Download, FileIcon, MessageSquare, Mic, RotateCcw, Smile } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { AudioPlayer } from "@/components/chat/AudioPlayer";
import { MediaViewer } from "@/components/chat/MediaViewer";
import { InteractiveListBubble } from "@/components/chat/InteractiveListBubble";
import { clockTime, dayLabel, fileSize } from "@/lib/chat/format";
import { mergeMessages, replaceMessage } from "@/lib/chat/reconcile";
import type { ChatDelivery, ChatMessageItem, ScheduledMessageItem } from "@/lib/chat/types";

export type MessageListHandle = {
  add: (message: ChatMessageItem) => void;
  replace: (id: string, message: ChatMessageItem) => void;
  remove: (id: string) => void;
  refresh: () => void;
  holdRefresh: () => void;
  releaseRefresh: () => void;
};

function Delivery({ delivery, reason, onLime, onLight }: { delivery: ChatDelivery | null; reason: string | null; onLime: boolean; onLight?: boolean }) {
  if (delivery === "sending") return <Clock className="h-3.5 w-3.5" aria-label="Enviando" />;
  if (delivery === "sent") return <Check className="h-3.5 w-3.5" aria-label="Enviada" />;
  if (delivery === "delivered") return <CheckCheck className="h-3.5 w-3.5" aria-label="Entregue" />;
  // No tema escuro o balão do atendente é lima: o check da mesma cor sumiria sobre ele.
  // Na cápsula de áudio o fundo é claro: o lima sumiria sobre o branco.
  if (delivery === "read" && onLight) return <CheckCheck className="h-3.5 w-3.5 text-[#002187] dark:text-[#C4D600]" aria-label="Lida" />;
  if (delivery === "read") return <CheckCheck className={`h-3.5 w-3.5 text-[#C4D600] ${onLime ? "dark:text-[#002187]" : ""}`} aria-label="Lida" />;
  if (delivery === "failed") return <span title={reason ?? "Falha no envio"}><AlertCircle className="h-3.5 w-3.5 text-red-400" aria-label="Falhou" /></span>;
  return null;
}

const mediaUrl = (message: ChatMessageItem) => message.attachment?.localUrl ?? `/api/chat/media/${message.id}`;

const MISSING_MEDIA: Record<string, { icon: typeof Mic; label: string }> = {
  audio: { icon: Mic, label: "Áudio indisponível" },
  sticker: { icon: Smile, label: "Figurinha indisponível" },
  image: { icon: FileIcon, label: "Imagem indisponível" },
  video: { icon: FileIcon, label: "Vídeo indisponível" },
  document: { icon: FileIcon, label: "Documento indisponível" },
};

/** Quando o download falha, a mensagem fica gravada só com o rótulo do tipo, sem arquivo. */
/** Registros antigos de aviso de protocolo da Meta gravados como se fossem do cliente. */
const LEGACY_PROTOCOL_TEXT = "[Mensagem do tipo system]";

const LABEL_KINDS: Record<string, string> = {
  "[Áudio]": "audio",
  "[Figurinha]": "sticker",
  "[Imagem]": "image",
  "[Vídeo]": "video",
  "[Documento]": "document",
};

function MissingMedia({ kind, onRetry }: { kind: string; onRetry?: () => Promise<boolean> }) {
  const [retrying, setRetrying] = useState(false);
  const [failed, setFailed] = useState(false);
  const { icon: Icon, label } = MISSING_MEDIA[kind] ?? MISSING_MEDIA.document;

  const retry = async () => {
    setRetrying(true);
    setFailed(false);
    const done = await onRetry?.();
    setFailed(!done);
    setRetrying(false);
  };

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span title="O arquivo não pôde ser baixado da Meta." className="flex items-center gap-1.5 italic opacity-70">
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </span>
      {onRetry && (
        <button
          type="button"
          title={failed ? "Ainda indisponível. Tentar baixar novamente" : "Tentar baixar novamente"}
          aria-label="Tentar baixar novamente"
          disabled={retrying}
          onClick={() => void retry()}
          className={`cursor-pointer rounded p-1 transition-colors hover:bg-black/10 disabled:cursor-not-allowed dark:hover:bg-white/10 ${failed ? "text-red-500" : "opacity-70"}`}
        >
          <RotateCcw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
        </button>
      )}
    </div>
  );
}

function Sticker({ message, onOpen }: { message: ChatMessageItem; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span title="Não foi possível carregar a figurinha" className="grid h-32 w-32 place-items-center rounded-xl bg-slate-200/60 text-slate-400 dark:bg-white/5">
        <Smile className="h-8 w-8" />
      </span>
    );
  }
  return (
    <button type="button" onClick={onOpen} aria-label="Abrir figurinha" className="block cursor-pointer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaUrl(message)} alt="Figurinha" loading="lazy" onError={() => setFailed(true)} className="h-40 w-40 object-contain" />
    </button>
  );
}

function Attachment({ message, onOpen }: { message: ChatMessageItem; onOpen: () => void }) {
  const attachment = message.attachment!;
  if (attachment.kind === "sticker") return <Sticker message={message} onOpen={onOpen} />;
  if (attachment.kind === "image") {
    return (
      <button type="button" onClick={onOpen} aria-label={`Abrir ${attachment.name}`} className="mb-1 block cursor-pointer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaUrl(message)} alt={attachment.name} loading="lazy" className="max-h-64 rounded-lg object-contain" />
      </button>
    );
  }
  if (attachment.kind === "video") return <video src={mediaUrl(message)} controls preload="metadata" className="mb-1 max-h-64 rounded-lg" />;
  if (attachment.kind === "audio") {
    return <AudioPlayer src={mediaUrl(message)} />;
  }
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
  /** Agendadas pendentes (e falhas recentes), mostradas depois da última mensagem. */
  scheduled?: ScheduledMessageItem[];
  onCancelScheduled?: (id: string) => void;
};

/** Mensagem agendada: balão pontilhado no fim da conversa, até o relógio enviar. */
function ScheduledBubble({ item, onCancel }: { item: ScheduledMessageItem; onCancel?: (id: string) => void }) {
  const failed = item.status === "FAILED";
  const when = new Date(item.scheduledFor).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return (
    <div className="flex justify-end">
      <div className={`max-w-[75%] rounded-2xl rounded-br-sm border border-dashed px-3 py-1.5 2xl:px-4 2xl:py-2.5 ${failed ? "border-red-300 bg-red-50/80 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200" : "border-[#002187]/40 bg-white/70 text-slate-700 dark:border-[#C4D600]/40 dark:bg-white/5 dark:text-slate-200"}`}>
        <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold opacity-80">
          <Clock className="h-3 w-3" />
          {failed ? `Não enviada (agendada para ${when})` : `Agendada para ${when}`} · {item.userName}
        </p>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed opacity-90">{item.text}</p>
        {failed && item.failureReason && <p className="mt-1 text-[11px] font-medium">{item.failureReason}</p>}
        {onCancel && (
          <div className="mt-1 flex justify-end">
            <button type="button" onClick={() => onCancel(item.id)} className="cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-black/5 hover:text-red-600 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-red-300">
              {failed ? "Dispensar" : "Cancelar envio"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function MessageList({ conversationId, tick, onReply, listRef, scheduled, onCancelScheduled }: Props) {
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

  const retryMedia = async (messageId: string) => {
    const response = await fetch(`/api/chat/media/${messageId}/retry`, { method: "POST" }).catch(() => null);
    if (!response?.ok) return false;
    merge([(await response.json()) as ChatMessageItem]);
    return true;
  };

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
    return <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-100/70 dark:bg-[#040e2e]"><LoadingSpinner label="Carregando mensagens..." size={32} /></div>;
  }

  return (
    <div className="relative isolate min-h-0 flex-1 overflow-hidden bg-slate-100/70 dark:bg-[#040e2e]">
    {/* Fora da área de rolagem, para a textura cobrir a tela inteira e não rolar com as mensagens. */}
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 bg-repeat opacity-[0.035] [background-size:360px_auto] dark:opacity-[0.025] dark:invert" style={{ backgroundImage: "url('/images/chat-bg-glasses.svg')" }} />
    <div
      ref={scroller}
      onScroll={(event) => {
        if (event.currentTarget.scrollTop < 80) void loadOlder();
      }}
      className="absolute inset-0 z-10 overflow-y-auto p-3 xl:p-4"
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
            const sticker = message.attachment?.kind === "sticker" && !message.text;
            const missing = message.author === "customer" && !message.attachment ? message.pendingMedia ?? LABEL_KINDS[message.text] : undefined;
            const voice = message.attachment?.kind === "audio";
            // Áudio sem legenda, citação ou nota interna vira a própria cápsula, sem o balão em volta.
            const pill = voice && !message.text && !message.replyTo && !message.internal;
            return (
              <div key={message.id} id={`msg-${message.id}`} className="scroll-mt-4">
                {newDay && (
                  <div className="mb-3 flex justify-center">
                    <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-medium text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-300">{dayLabel(message.createdAt)}</span>
                  </div>
                )}
                {message.author === "system" || message.text === LEGACY_PROTOCOL_TEXT ? (
                  <div className="flex justify-center">
                    <span className="max-w-[85%] rounded-lg bg-slate-200/70 px-3 py-1.5 text-center text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {message.text === LEGACY_PROTOCOL_TEXT ? "Aviso de sistema do WhatsApp" : message.text} · {clockTime(message.createdAt)}
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
                      className={pill ? `flex max-w-full flex-col ${fromUs ? "items-end" : "items-start"}` : sticker ? "relative max-w-[75%] text-slate-900 dark:text-white" : `max-w-[75%] rounded-2xl px-3 py-1.5 shadow-sm 2xl:px-4 2xl:py-2.5 ${
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
                        <p className={`mb-1 text-[10px] font-semibold opacity-80 ${pill ? "px-3 text-slate-500 dark:text-slate-400" : ""}`}>
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
                      {pill ? (
                        <AudioPlayer
                          src={mediaUrl(message)}
                          meta={
                            <>
                              <span>{clockTime(message.createdAt)}</span>
                              {fromUs && <Delivery delivery={message.delivery} reason={message.failureReason} onLime={false} onLight />}
                            </>
                          }
                        />
                      ) : (
                        message.attachment && <Attachment message={message} onOpen={() => setViewing(message.id)} />
                      )}
                      {missing && <MissingMedia kind={missing} onRetry={message.pendingMedia && onReply ? () => retryMedia(message.id) : undefined} />}
                      {message.interactive ? (
                        <InteractiveListBubble list={message.interactive} messageId={message.id} />
                      ) : message.text && !(missing && LABEL_KINDS[message.text]) && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>}
                      {!pill && <div className={sticker ? "absolute bottom-1 right-1 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] text-white shadow-sm" : `mt-1 flex items-center gap-1 text-[10px] opacity-70 ${fromUs || voice ? "justify-end" : "justify-start"}`}>
                        <span>{clockTime(message.createdAt)}</span>
                        {fromUs && !message.internal && <Delivery delivery={message.delivery} reason={message.failureReason} onLime={message.author === "agent"} />}
                      </div>}
                      {message.delivery === "failed" && <p className={`mt-1 text-[10px] font-medium ${pill ? "px-3 text-red-500" : "text-red-300"}`}>{message.failureReason ?? "Falha no envio"}</p>}
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
          {scheduled?.map((item) => <ScheduledBubble key={item.id} item={item} onCancel={onCancelScheduled} />)}
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
    </div>
  );
}
