"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRightLeft, Bell, BellOff, CheckCircle2, Hand, Info, Mail, MessageSquare, MessageSquarePlus, Phone, RotateCcw } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { EntityDialog } from "@/components/EntityDialog";
import { ConversationList } from "@/components/chat/ConversationList";
import { Composer, type ComposerSend } from "@/components/chat/Composer";
import { MessageList, type MessageListHandle } from "@/components/chat/MessageList";
import { NewConversationDialog } from "@/components/chat/NewConversationDialog";
import type { TemplateChoice } from "@/components/chat/TemplatePicker";
import { TransferDialog } from "@/components/chat/TransferDialog";
import { alertsEnabled, disableAlerts, enableAlerts } from "@/lib/chat/alerts";
import { initials, waitingLabel } from "@/lib/chat/format";
import { formatPhone } from "@/lib/chat/phone";
import { PRIORITY_LABELS, STATUS_LABELS, type ChatMessageItem, type ChatPriority, type ChatTab, type ConversationDetail, type ConversationItem } from "@/lib/chat/types";
import { usePulse } from "@/lib/chat/use-pulse";

const EMPTY_COUNTS: Record<ChatTab, number> = { queue: 0, mine: 0, all: 0, closed: 0 };

function ChatWorkspace() {
  const selectedId = useSearchParams().get("c");
  const tick = usePulse();

  const [tab, setTab] = useState<ChatTab>("queue");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [queueId, setQueueId] = useState("");
  const [priority, setPriority] = useState("");
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(false);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [alertsOn, setAlertsOn] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessageItem | null>(null);
  const [sendError, setSendError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({});
  const [queueOptions, setQueueOptions] = useState<{ id: string; name: string }[]>([]);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const canWrite = capabilities["chat.assume"] === true;
  const listRequest = useRef(0);
  const messageList = useRef<MessageListHandle>(null);

  useEffect(() => {
    setAlertsOn(alertsEnabled());
    fetch("/api/me/chat")
      .then(async (response) => {
        if (!response.ok) return;
        const me = (await response.json()) as { capabilities: Record<string, boolean> };
        setCapabilities(me.capabilities);
      })
      .catch((error) => console.error("[chat]", error));
    fetch("/api/chat/queues")
      .then(async (response) => {
        if (response.ok) setQueueOptions(((await response.json()) as { data: { id: string; name: string }[] }).data);
      })
      .catch((error) => console.error("[chat]", error));
  }, []);

  useEffect(() => {
    setReplyTo(null);
    setSendError("");
    if (selectedId) {
      void fetch(`/api/chat/conversations/${selectedId}/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    }
  }, [selectedId]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadList = useCallback(async (cursor = 0) => {
    const requestId = ++listRequest.current;
    try {
      const params = new URLSearchParams({ tab });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (queueId) params.set("queueId", queueId);
      if (priority) params.set("priority", priority);
      if (cursor) params.set("cursor", String(cursor));
      const response = await fetch(`/api/chat/conversations?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { items: ConversationItem[]; nextCursor: number | null; counts: Record<ChatTab, number> };
      if (requestId !== listRequest.current) return;
      setItems((current) => {
        if (!cursor) return data.items;
        const loaded = new Set(current.map((item) => item.id));
        return [...current, ...data.items.filter((item) => !loaded.has(item.id))];
      });
      setCounts(data.counts);
      setNextCursor(data.nextCursor);
      setListError(false);
    } catch (error) {
      console.error("[chat] falha ao carregar conversas:", error);
      if (requestId === listRequest.current) setListError(true);
    } finally {
      if (requestId === listRequest.current) setLoadingList(false);
    }
  }, [tab, debouncedSearch, queueId, priority]);

  useEffect(() => {
    void loadList();
  }, [loadList, tick]);

  const loadDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/chat/conversations/${id}`, { cache: "no-store" });
    setDetail(response.ok ? ((await response.json()) as ConversationDetail) : null);
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId).catch((error) => console.error("[chat]", error));
    else setDetail(null);
  }, [selectedId, loadDetail, tick]);

  const select = (id: string | null) => {
    window.history.pushState(null, "", id ? `/chat?c=${id}` : "/chat");
  };

  const toggleAlerts = async () => {
    if (alertsOn) {
      disableAlerts();
      setAlertsOn(false);
    } else {
      await enableAlerts();
      setAlertsOn(true);
    }
  };

  const postMessage = async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/chat/conversations/${selectedId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as (ChatMessageItem & { error?: string }) | null;
    if (!response.ok) throw new Error(data?.error ?? "Não foi possível enviar a mensagem.");
    return data as ChatMessageItem;
  };

  const handleSend = async ({ text, internal, replyTo: quoted }: ComposerSend) => {
    const temporaryId = `temp-${Date.now()}`;
    setSendError("");
    messageList.current?.add({
      id: temporaryId,
      author: "agent",
      authorName: null,
      text,
      delivery: internal ? null : "sending",
      failureReason: null,
      internal,
      replyTo: quoted && !internal ? { author: quoted.authorName ?? "Cliente", text: quoted.text, messageId: quoted.id } : null,
      createdAt: new Date().toISOString(),
      attachment: null,
    });
    try {
      const saved = await postMessage({ text, internal, replyToId: internal ? undefined : quoted?.id });
      messageList.current?.replace(temporaryId, saved);
      setReplyTo(null);
      void loadList();
      if (selectedId) void loadDetail(selectedId);
      if (saved.delivery === "failed") {
        setSendError(saved.failureReason ?? "Falha no envio.");
        return false;
      }
      return true;
    } catch (error) {
      messageList.current?.remove(temporaryId);
      setSendError(error instanceof Error ? error.message : "Não foi possível enviar a mensagem.");
      return false;
    }
  };

  const uploadAttachment = (file: File) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = new XMLHttpRequest();
      const form = new FormData();
      form.append("file", file);
      request.open("POST", "/api/chat/media");
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100));
      };
      request.onload = () => {
        const data = (() => {
          try {
            return JSON.parse(request.responseText) as Record<string, unknown>;
          } catch {
            return {};
          }
        })();
        if (request.status === 201) resolve(data);
        else reject(new Error(typeof data.error === "string" ? data.error : "Não foi possível enviar o arquivo."));
      };
      request.onerror = () => reject(new Error("Falha de conexão ao enviar o arquivo."));
      request.send(form);
    });

  const handleAttach = async (file: File, caption: string) => {
    const temporaryId = `temp-${Date.now()}`;
    const localUrl = URL.createObjectURL(file);
    const kind = file.type.startsWith("audio/") ? "audio" : file.type === "video/mp4" ? "video" : file.type === "image/jpeg" || file.type === "image/png" ? "image" : "document";
    setSendError("");
    setUploadProgress(0);
    messageList.current?.add({
      id: temporaryId,
      author: "agent",
      authorName: null,
      text: caption,
      delivery: "sending",
      failureReason: null,
      internal: false,
      replyTo: null,
      createdAt: new Date().toISOString(),
      attachment: { kind, name: file.name, mime: file.type, size: file.size, localUrl },
    });
    try {
      const attachment = await uploadAttachment(file);
      const saved = await postMessage({ text: caption, attachment, replyToId: replyTo?.id });
      messageList.current?.replace(temporaryId, saved);
      setReplyTo(null);
      void loadList();
      if (selectedId) void loadDetail(selectedId);
      if (saved.delivery === "failed") {
        setSendError(saved.failureReason ?? "Falha no envio.");
        return false;
      }
      return true;
    } catch (error) {
      messageList.current?.remove(temporaryId);
      setSendError(error instanceof Error ? error.message : "Não foi possível enviar o arquivo.");
      return false;
    } finally {
      setUploadProgress(null);
      URL.revokeObjectURL(localUrl);
    }
  };

  const handleTemplate = async (template: TemplateChoice) => {
    setSendError("");
    try {
      await postMessage({ template });
      messageList.current?.refresh();
      void loadList();
      if (selectedId) void loadDetail(selectedId);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Não foi possível enviar o modelo.");
    }
  };

  const refreshOpen = () => {
    void loadList();
    if (selectedId) void loadDetail(selectedId);
    messageList.current?.refresh();
  };

  const conversationAction = async (path: string, init?: RequestInit) => {
    setSendError("");
    const response = await fetch(`/api/chat/conversations/${selectedId}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, ...init }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string; openConversationId?: string } | null;
    if (response?.ok) refreshOpen();
    else {
      setSendError(data?.error ?? "Não foi possível concluir a ação.");
      if (data?.openConversationId) select(data.openConversationId);
    }
  };

  const updateConversation = (body: Record<string, unknown>) => conversationAction("", { method: "PATCH", body: JSON.stringify(body) });

  const open = selectedId ? detail?.id === selectedId ? detail : null : null;
  const waiting = open?.status === "waiting" ? waitingLabel(open.waitingSince).text : "";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-4 py-6 sm:px-7 sm:py-8 xl:px-10">
      <div className="flex flex-1 min-h-0 w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/80 dark:bg-[#07194f]">
        <div className={`flex min-h-0 flex-col border-r border-slate-200 dark:border-slate-800 ${selectedId ? "hidden md:flex" : "flex"} w-full md:w-[35%] lg:w-[35%]`}>
          <ConversationList
            items={items}
            counts={counts}
            tab={tab}
            onTab={setTab}
            search={search}
            onSearch={setSearch}
            queueId={queueId}
            onQueue={setQueueId}
            priority={priority}
            onPriority={setPriority}
            queues={queueOptions}
            loading={loadingList}
            error={listError}
            selectedId={selectedId}
            onSelect={select}
            onEndReached={() => {
              if (nextCursor) void loadList(nextCursor);
            }}
            actions={(
              <>
                {canWrite && (
                  <button type="button" onClick={() => setShowNew(true)} title="Nova conversa" aria-label="Nova conversa" className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg bg-[#051647] text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]">
                    <MessageSquarePlus className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void toggleAlerts()}
                  title={alertsOn ? "Desligar som" : "Ligar som"}
                  aria-label={alertsOn ? "Desligar som" : "Ligar som"}
                  className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {alertsOn ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                </button>
              </>
            )}
          />
        </div>

        <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${selectedId ? "flex" : "hidden md:flex"}`}>
          {open ? (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#07194f]">
                <button type="button" onClick={() => select(null)} aria-label="Voltar" className="md:hidden cursor-pointer rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#051647] text-sm font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">
                  {initials(open.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{open.name}</h3>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {STATUS_LABELS[open.status]}
                    {open.assignee ? ` · ${open.assignee.name}` : ""}
                    {waiting ? ` · esperando há ${waiting}` : ""}
                    {open.queue ? ` · ${open.queue.name}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1">
                  {canWrite && !open.closedAt && (
                    <select aria-label="Prioridade" value={open.priority} onChange={(event) => void updateConversation({ priority: event.target.value })} className="hidden h-8 cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs outline-none sm:block dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                      {(Object.keys(PRIORITY_LABELS) as ChatPriority[]).map((key) => <option key={key} value={key}>{PRIORITY_LABELS[key]}</option>)}
                    </select>
                  )}
                  {canWrite && !open.closedAt && !open.assignee && (
                    <button type="button" onClick={() => void conversationAction("/assume")} title="Assumir" aria-label="Assumir" className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><Hand className="h-4 w-4" /></button>
                  )}
                  {capabilities["chat.transfer"] && !open.closedAt && (
                    <button type="button" onClick={() => setShowTransfer(true)} title="Transferir" aria-label="Transferir" className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><ArrowRightLeft className="h-4 w-4" /></button>
                  )}
                  {!open.closedAt && (
                    <button type="button" onClick={() => void conversationAction("/read", { body: JSON.stringify({ unread: true }) })} title="Marcar como não lida" aria-label="Marcar como não lida" className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><Mail className="h-4 w-4" /></button>
                  )}
                  {capabilities["chat.close"] && !open.closedAt && (
                    <button type="button" onClick={() => void conversationAction("/close")} title="Encerrar" aria-label="Encerrar" className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><CheckCircle2 className="h-4 w-4" /></button>
                  )}
                  {capabilities["chat.close"] && canWrite && open.closedAt && (
                    <button type="button" onClick={() => void conversationAction("/reopen")} title="Reabrir" aria-label="Reabrir" className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><RotateCcw className="h-4 w-4" /></button>
                  )}
                  <a href={`tel:${open.phone}`} title={formatPhone(open.phone)} className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                    <Phone className="h-4 w-4" />
                  </a>
                  <button type="button" onClick={() => setShowDetails(true)} title="Detalhes do contato" aria-label="Detalhes do contato" className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                    <Info className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <MessageList key={open.id} conversationId={open.id} tick={tick} onReply={canWrite ? setReplyTo : undefined} listRef={messageList} />
              <Composer key={open.id} conversation={open} canWrite={canWrite} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSend={handleSend} onTemplate={handleTemplate} onAttach={handleAttach} onError={setSendError} uploadProgress={uploadProgress} error={sendError} />
            </>
          ) : selectedId ? (
            <div className="flex flex-1 items-center justify-center"><LoadingSpinner label="Abrindo conversa..." size={32} /></div>
          ) : (
            <div className="hidden flex-1 flex-col items-center justify-center gap-4 md:flex">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#25D366]/10">
                <MessageSquare className="h-10 w-10 text-[#25D366]" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Suas conversas do WhatsApp</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Selecione uma conversa na lista à esquerda para iniciar o atendimento</p>
              </div>
            </div>
          )}
        </div>

        {showDetails && open && (
          <EntityDialog titleId="contact-details-title" title={open.name} description="Detalhes do contato" onClose={() => setShowDetails(false)}>
            <div className="space-y-4 overflow-y-auto p-1">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#051647] text-xl font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">
                  {initials(open.name)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{open.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{formatPhone(open.phone)}</p>
                  {open.email && <p className="text-xs text-slate-500 dark:text-slate-400">{open.email}</p>}
                </div>
              </div>
              <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Categoria</span>
                  <span className="font-medium text-slate-900 dark:text-white capitalize">{open.category}</span>
                </div>
                {open.segment && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Segmento</span>
                    <span className="font-medium text-slate-900 dark:text-white">{open.segment}</span>
                  </div>
                )}
              </div>
              <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Etiquetas</p>
                <div className="flex flex-wrap gap-1.5">
                  {open.tags.map((tag) => (
                    <button key={tag} type="button" title="Remover etiqueta" disabled={!canWrite} onClick={() => void updateConversation({ tags: open.tags.filter((item) => item !== tag) })} className="cursor-pointer rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">{tag} ×</button>
                  ))}
                </div>
                {canWrite && (
                  <input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={(event) => {
                      const tag = tagInput.trim();
                      if (event.key === "Enter" && tag) {
                        event.preventDefault();
                        setTagInput("");
                        if (!open.tags.includes(tag)) void updateConversation({ tags: [...open.tags, tag] });
                      }
                    }}
                    placeholder="Nova etiqueta e Enter"
                    aria-label="Nova etiqueta"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
                  />
                )}
              </div>
              {open.previous.length > 0 && (
                <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Conversas anteriores</p>
                  {open.previous.map((item) => (
                    <button key={item.id} type="button" onClick={() => { setShowDetails(false); select(item.id); }} className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-left text-xs hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-white/5">
                      <span className="text-slate-700 dark:text-slate-200">{new Date(item.createdAt).toLocaleDateString("pt-BR")}{item.queue ? ` · ${item.queue.name}` : ""}</span>
                      <span className="text-slate-500 dark:text-slate-400">{STATUS_LABELS[item.status]}</span>
                    </button>
                  ))}
                </div>
              )}
              <Link href={`/contatos?busca=${encodeURIComponent(open.phone.replace(/^55/, ""))}`} className="inline-block cursor-pointer text-sm font-medium text-[#002187] hover:underline dark:text-[#C4D600]">Abrir ficha do contato</Link>
            </div>
          </EntityDialog>
        )}

        {showTransfer && open && (
          <TransferDialog conversationId={open.id} currentQueueId={open.queue?.id ?? null} onClose={() => setShowTransfer(false)} onDone={() => { setShowTransfer(false); refreshOpen(); }} />
        )}

        {showNew && (
          <NewConversationDialog onClose={() => setShowNew(false)} onOpened={(id) => { setShowNew(false); setTab("mine"); select(id); void loadList(); }} />
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><LoadingSpinner label="Carregando..." size={32} /></div>}>
      <ChatWorkspace />
    </Suspense>
  );
}
