"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Bell, BellOff, Info, MessageSquare, Phone } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { EntityDialog } from "@/components/EntityDialog";
import { ConversationList } from "@/components/chat/ConversationList";
import { Composer, type ComposerSend } from "@/components/chat/Composer";
import { MessageList, type MessageListHandle } from "@/components/chat/MessageList";
import type { TemplateChoice } from "@/components/chat/TemplatePicker";
import { alertsEnabled, disableAlerts, enableAlerts } from "@/lib/chat/alerts";
import { initials, waitingLabel } from "@/lib/chat/format";
import { formatPhone } from "@/lib/chat/phone";
import { STATUS_LABELS, type ChatMessageItem, type ChatTab, type ConversationDetail, type ConversationItem } from "@/lib/chat/types";
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
  const [canWrite, setCanWrite] = useState(false);
  const listRequest = useRef(0);
  const messageList = useRef<MessageListHandle>(null);

  useEffect(() => {
    setAlertsOn(alertsEnabled());
    fetch("/api/me/chat")
      .then(async (response) => {
        if (response.ok) setCanWrite(((await response.json()) as { capabilities: Record<string, boolean> }).capabilities["chat.assume"] === true);
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

  const queues = [...new Map(items.flatMap((item) => (item.queue ? [[item.queue.id, item.queue]] : []))).values()];
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
            queues={queues}
            loading={loadingList}
            error={listError}
            selectedId={selectedId}
            onSelect={select}
            onEndReached={() => {
              if (nextCursor) void loadList(nextCursor);
            }}
            actions={(
              <button
                type="button"
                onClick={() => void toggleAlerts()}
                title={alertsOn ? "Desligar som" : "Ligar som"}
                aria-label={alertsOn ? "Desligar som" : "Ligar som"}
                className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {alertsOn ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              </button>
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
                <div className="flex items-center gap-1">
                  <a href={`tel:${open.phone}`} title={formatPhone(open.phone)} className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                    <Phone className="h-4 w-4" />
                  </a>
                  <button type="button" onClick={() => setShowDetails(true)} title="Detalhes do contato" aria-label="Detalhes do contato" className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                    <Info className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <MessageList key={open.id} conversationId={open.id} tick={tick} onReply={canWrite ? setReplyTo : undefined} listRef={messageList} />
              <Composer conversation={open} canWrite={canWrite} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSend={handleSend} onTemplate={handleTemplate} error={sendError} />
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
            </div>
          </EntityDialog>
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
