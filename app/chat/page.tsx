"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRightLeft, Ban, Bell, BellOff, CheckCircle2, Hand, Mail, MessageSquare, MessageSquarePlus, MoreVertical, RotateCcw, Target, Trash2, UserRound } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { EntityDialog } from "@/components/EntityDialog";
import { useToast } from "@/components/ToastProvider";
import { CampaignBadge } from "@/components/chat/CampaignBadge";
import { ConversationList } from "@/components/chat/ConversationList";
import { Composer, type ComposerSend } from "@/components/chat/Composer";
import { DeleteConversationDialog } from "@/components/chat/DeleteConversationDialog";
import { FloatingMenu, type FloatingMenuItem } from "@/components/chat/FloatingMenu";
import { MessageList, type MessageListHandle } from "@/components/chat/MessageList";
import { NewConversationDialog } from "@/components/chat/NewConversationDialog";
import { PriorityPill } from "@/components/chat/PriorityPill";
import type { TemplateChoice } from "@/components/chat/TemplatePicker";
import { TransferDialog } from "@/components/chat/TransferDialog";
import { alertsEnabled, disableAlerts, enableAlerts } from "@/lib/chat/alerts";
import { initials, relativeTime, waitingLabel } from "@/lib/chat/format";
import { formatPhone } from "@/lib/chat/phone";
import { STATUS_LABELS, type ChatMessageItem, type ChatTab, type ConversationDetail, type ConversationItem } from "@/lib/chat/types";
import { usePulse } from "@/lib/chat/use-pulse";

const EMPTY_COUNTS: Record<ChatTab, number> = { queue: 0, mine: 0, all: 0, closed: 0, unread: 0, campaigns: 0 };

function ChatWorkspace() {
  const selectedId = useSearchParams().get("c");
  const tick = usePulse();
  const toast = useToast();

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
  const [agentName, setAgentName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
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
        const me = (await response.json()) as { name: string; isAdmin: boolean; capabilities: Record<string, boolean> };
        setCapabilities(me.capabilities);
        setAgentName(me.name);
        setIsAdmin(me.isAdmin);
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
    // A sincronização espera o envio terminar para não trazer a mensagem antes da resposta do POST.
    const list = messageList.current;
    list?.holdRefresh();
    try {
      const response = await fetch(`/api/chat/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as (ChatMessageItem & { error?: string }) | null;
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível enviar a mensagem.");
      return data as ChatMessageItem;
    } finally {
      list?.releaseRefresh();
    }
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

  const toggleBlock = async (phone: string, blocked: boolean) => {
    const response = await fetch(blocked ? `/api/chat/blocked?phone=${encodeURIComponent(phone)}` : "/api/chat/blocked", {
      method: blocked ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      ...(blocked ? {} : { body: JSON.stringify({ phone }) }),
    }).catch(() => null);
    if (response?.ok) refreshOpen();
    else setSendError("Não foi possível alterar o bloqueio.");
  };

  const handleDeleted = (id: string) => {
    setDeleteTarget(null);
    setItems((current) => current.filter((item) => item.id !== id));
    if (selectedId === id) select(null);
    void loadList();
    toast.success("Conversa excluída", "A conversa e o histórico de mensagens foram removidos.");
  };

  const open = selectedId ? detail?.id === selectedId ? detail : null : null;

  // Mensagem que chega na conversa aberta já foi vista; depende do horário para respeitar "Marcar como não lida".
  const openHasUnread = !!open?.unreadCount;
  const openLastMessageAt = open?.lastMessageAt;
  useEffect(() => {
    if (!selectedId || !openHasUnread || document.hidden) return;
    void fetch(`/api/chat/conversations/${selectedId}/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, openLastMessageAt]);
  const waiting = open?.status === "waiting" ? waitingLabel(open.waitingSince).text : "";
  const lastContact = open?.lastMessageAt ? `último contato: ${relativeTime(open.lastMessageAt).toLowerCase()}` : "";
  const headerInfo = open
    ? [formatPhone(open.phone), STATUS_LABELS[open.status], open.assignee?.name, open.queue?.name, waiting ? `esperando há ${waiting}` : lastContact].filter(Boolean).join(" · ")
    : "";
  const menuItems: FloatingMenuItem[] = open
    ? [
        { label: "Assumir atendimento", icon: <Hand className="h-4 w-4" />, onSelect: () => void conversationAction("/assume"), hidden: !canWrite || !!open.closedAt || !!open.assignee },
        { label: "Ver dados do cliente", icon: <UserRound className="h-4 w-4" />, onSelect: () => setShowDetails(true) },
        { label: "Criar oportunidade", icon: <Target className="h-4 w-4" />, href: `/?oportunidade=${encodeURIComponent(open.contactId)}&contato=${encodeURIComponent(open.name)}`, hidden: !canWrite },
        { label: "Transferir conversa", icon: <ArrowRightLeft className="h-4 w-4" />, onSelect: () => setShowTransfer(true), hidden: !capabilities["chat.transfer"] || !!open.closedAt },
        { label: "Marcar como não lida", icon: <Mail className="h-4 w-4" />, onSelect: () => void conversationAction("/read", { body: JSON.stringify({ unread: true }) }), hidden: !!open.closedAt },
        { label: "Finalizar atendimento", icon: <CheckCircle2 className="h-4 w-4" />, onSelect: () => void conversationAction("/close"), hidden: !capabilities["chat.close"] || !!open.closedAt },
        { label: "Reabrir atendimento", icon: <RotateCcw className="h-4 w-4" />, onSelect: () => void conversationAction("/reopen"), hidden: !capabilities["chat.close"] || !canWrite || !open.closedAt },
        { label: open.blocked ? "Desbloquear contato" : "Bloquear contato", icon: <Ban className="h-4 w-4" />, onSelect: () => void toggleBlock(open.phone, open.blocked), danger: true, hidden: !capabilities["chat.queues"] },
        { label: "Excluir conversa", icon: <Trash2 className="h-4 w-4" />, onSelect: () => setDeleteTarget({ id: open.id, name: open.name }), danger: true, hidden: !isAdmin },
      ]
    : [];

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
            onDelete={isAdmin ? (item) => setDeleteTarget({ id: item.id, name: item.name }) : undefined}
            onEndReached={() => {
              if (nextCursor) void loadList(nextCursor);
            }}
            actions={(
              <>
                {canWrite && (
                  <button type="button" onClick={() => setShowNew(true)} className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-xs font-medium text-[#051647] shadow-xs transition-opacity hover:opacity-90 dark:bg-[#C4D600]">
                    <MessageSquarePlus className="h-4 w-4" />
                    Nova conversa
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void toggleAlerts()}
                  title={alertsOn ? "Desligar som" : "Ligar som"}
                  aria-label={alertsOn ? "Desligar som" : "Ligar som"}
                  className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
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
                <div className="relative shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#051647] text-sm font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">
                    {initials(open.name)}
                  </div>
                  {open.windowOpen && !open.closedAt && (
                    <span title="Janela de 24h aberta" className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#25D366] ring-2 ring-white dark:ring-[#07194f]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{open.name}</h3>
                  <div className="flex min-w-0 items-center gap-2">
                    <p title={headerInfo} className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">{headerInfo}</p>
                    {open.campaign && <CampaignBadge name={open.campaign.name} className="max-w-[45%] shrink-0" />}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <PriorityPill key={`${open.id}-priority`} priority={open.priority} onChange={canWrite && !open.closedAt ? (value) => void updateConversation({ priority: value }) : undefined} />
                  <FloatingMenu
                    key={open.id}
                    label="Ações da conversa"
                    widthClassName="w-60"
                    triggerClassName="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
                    trigger={<MoreVertical className="h-5 w-5" />}
                    items={menuItems}
                  />
                </div>
              </div>
              <MessageList key={open.id} conversationId={open.id} tick={tick} onReply={canWrite ? setReplyTo : undefined} listRef={messageList} />
              <Composer key={open.id} conversation={open} agentName={agentName} canWrite={canWrite} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSend={handleSend} onTemplate={handleTemplate} onAttach={handleAttach} onError={setSendError} uploadProgress={uploadProgress} error={sendError} />
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
              {open.campaigns.length > 0 && (
                <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Campanhas de origem</p>
                  {open.campaigns.map((campaign) => (
                    <div key={campaign.id} className="flex items-center justify-between gap-3">
                      <CampaignBadge name={campaign.name} className="min-w-0" />
                      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{new Date(campaign.repliedAt).toLocaleDateString("pt-BR")}</span>
                    </div>
                  ))}
                </div>
              )}
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
              <div className="flex items-center justify-between gap-3">
                <Link href={`/contatos?busca=${encodeURIComponent(open.phone.replace(/^55/, ""))}`} className="inline-block cursor-pointer text-sm font-medium text-[#002187] hover:underline dark:text-[#C4D600]">Abrir ficha do contato</Link>
                {capabilities["chat.queues"] && (
                  <button type="button" onClick={() => void toggleBlock(open.phone, open.blocked)} className="cursor-pointer text-sm font-medium text-red-600 hover:underline dark:text-red-300">
                    {open.blocked ? "Desbloquear número" : "Bloquear número"}
                  </button>
                )}
              </div>
            </div>
          </EntityDialog>
        )}

        {showTransfer && open && (
          <TransferDialog conversationId={open.id} currentQueueId={open.queue?.id ?? null} onClose={() => setShowTransfer(false)} onDone={() => { setShowTransfer(false); refreshOpen(); }} />
        )}

        {deleteTarget && (
          <DeleteConversationDialog conversation={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={handleDeleted} />
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
