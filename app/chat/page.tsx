"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, Ban, Bell, BellOff, CalendarClock, CheckCircle2, Hand, Mail, MessageSquare, MessageSquarePlus, MoreVertical, PanelRight, RotateCcw, ShoppingBag, Sparkles, Target, Trash2, UserRound } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/components/ToastProvider";
import { CampaignBadge } from "@/components/chat/CampaignBadge";
import { ContactDetailsDialog } from "@/components/chat/ContactDetailsDialog";
import { CustomerPanel } from "@/components/chat/CustomerPanel";
import { AiSalesDialog, AiSummaryDialog } from "@/components/chat/AiPanels";
import { FollowUpDialog } from "@/components/chat/ScheduleDialogs";
import { ConversationList } from "@/components/chat/ConversationList";
import { Composer, type ComposerSend } from "@/components/chat/Composer";
import { DeleteConversationDialog, deleteConversation, type DeleteReason } from "@/components/chat/DeleteConversationDialog";

const UNDO_DELETE_MS = 7000;
import { ContextMenu, FloatingMenu, type FloatingMenuItem } from "@/components/chat/FloatingMenu";
import { MessageList, type MessageListHandle } from "@/components/chat/MessageList";
import { NewConversationDialog } from "@/components/chat/NewConversationDialog";
import { PriorityPill } from "@/components/chat/PriorityPill";
import type { TemplateChoice } from "@/components/chat/TemplatePicker";
import { TransferDialog } from "@/components/chat/TransferDialog";
import { alertsEnabled, disableAlerts, enableAlerts } from "@/lib/chat/alerts";
import { initials, relativeTime, waitingLabel } from "@/lib/chat/format";
import { formatPhone } from "@/lib/chat/phone";
import { STATUS_LABELS, type ChatCounts, type ChatMessageItem, type ChatTab, type ConversationDetail, type ConversationItem, type ScheduledMessageItem } from "@/lib/chat/types";
import { usePulse } from "@/lib/chat/use-pulse";

const EMPTY_COUNTS: ChatCounts = { queue: 0, mine: 0, all: 0, closed: 0, unread: 0, campaigns: 0, followups: 0, followupsOverdue: 0, slaBreached: 0 };
const PANEL_KEY = "chat:painel-cliente";

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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; campaign: string | null } | null>(null);
  // Conversas excluídas aguardando o prazo do Desfazer: ocultas da lista mesmo se o recarregamento as trouxer.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const pendingDeletes = useRef(new Map<string, DeleteReason>());
  const [queueOptions, setQueueOptions] = useState<{ id: string; name: string }[]>([]);
  const [showTransfer, setShowTransfer] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newSearch, setNewSearch] = useState("");
  const [showPanel, setShowPanel] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpKey, setFollowUpKey] = useState(0);
  const [showSales, setShowSales] = useState(false);
  const [summaryTarget, setSummaryTarget] = useState<{ id: string; name: string } | null>(null);
  const [composerDraft, setComposerDraft] = useState<{ text: string; nonce: number } | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledMessageItem[]>([]);
  const canWrite = capabilities["chat.assume"] === true;
  const listRequest = useRef(0);
  const messageList = useRef<MessageListHandle>(null);

  // O painel do cliente lembra se ficou aberto (preferência só deste navegador).
  useEffect(() => {
    try {
      setShowPanel(window.localStorage.getItem(PANEL_KEY) === "1");
    } catch {
      // Sem armazenamento local: o painel começa fechado.
    }
  }, []);

  const togglePanel = () => {
    setShowPanel((current) => {
      try {
        window.localStorage.setItem(PANEL_KEY, current ? "0" : "1");
      } catch {
        // Preferência não salva; o painel ainda abre e fecha.
      }
      return !current;
    });
  };

  const loadScheduled = useCallback(async (id: string) => {
    const response = await fetch(`/api/chat/conversations/${id}/scheduled`, { cache: "no-store" }).catch(() => null);
    if (response?.ok) setScheduled(((await response.json()) as { items: ScheduledMessageItem[] }).items);
  }, []);

  useEffect(() => {
    setScheduled([]);
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) void loadScheduled(selectedId);
  }, [selectedId, loadScheduled, tick]);

  const cancelScheduled = async (scheduledId: string) => {
    const response = await fetch(`/api/chat/scheduled/${scheduledId}`, { method: "DELETE" }).catch(() => null);
    if (response?.ok) {
      setScheduled((current) => current.filter((item) => item.id !== scheduledId));
      toast.success("Envio agendado cancelado");
    } else {
      const data = (await response?.json().catch(() => null)) as { error?: string } | null;
      toast.error("Não foi possível cancelar", data?.error);
      if (selectedId) void loadScheduled(selectedId);
    }
  };

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
      const data = (await response.json()) as { items: ConversationItem[]; nextCursor: number | null; counts: ChatCounts };
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

  /** Sobe a conversa na hora; o recarregamento da lista confirma a ordem do servidor. */
  const bumpToTop = (id: string, at: string) => {
    setItems((current) => {
      const item = current.find((entry) => entry.id === id);
      return item ? [{ ...item, lastMessageAt: at }, ...current.filter((entry) => entry.id !== id)] : current;
    });
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
    if (!internal && selectedId) bumpToTop(selectedId, new Date().toISOString());
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

  const conversationAction = async (path: string, init?: RequestInit, id = selectedId, successTitle?: string) => {
    setSendError("");
    const response = await fetch(`/api/chat/conversations/${id}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, ...init }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string; openConversationId?: string } | null;
    if (response?.ok) {
      refreshOpen();
      if (successTitle) toast.success(successTitle);
    } else {
      const message = data?.error ?? "Não foi possível concluir a ação.";
      // Ação pelo clique direito: a conversa pode não estar aberta, então o erro vai em aviso.
      if (successTitle) toast.error("Ação não concluída", message);
      else setSendError(message);
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

  /**
   * Exclusão com prazo para desfazer: some da lista na hora e só vai ao servidor quando o aviso expira.
   * Fechar a aba no meio do prazo conclui a exclusão (keepalive), para não ficar meio apagada.
   */
  const handleDeleteConfirmed = (id: string, reason: DeleteReason) => {
    setDeleteTarget(null);
    const wasOpen = selectedId === id;
    setHiddenIds((current) => new Set(current).add(id));
    if (wasOpen) select(null);
    const unhide = () => setHiddenIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    const commit = async () => {
      if (!pendingDeletes.current.delete(id)) return;
      const error = await deleteConversation(id, reason);
      if (error) {
        unhide();
        toast.error("Conversa não excluída", error);
        return;
      }
      setItems((current) => current.filter((item) => item.id !== id));
      unhide();
      void loadList();
    };
    pendingDeletes.current.set(id, reason);
    toast.withAction("Conversa excluída", "A conversa e o histórico serão removidos.", {
      label: "Desfazer",
      duration: UNDO_DELETE_MS,
      onAction: () => {
        pendingDeletes.current.delete(id);
        unhide();
        if (wasOpen) select(id);
        toast.success("Exclusão cancelada");
      },
      onExpire: () => void commit(),
    });
  };

  // Aba fechada ou recarregada com exclusão pendente: conclui agora.
  useEffect(() => {
    const flush = () => {
      for (const [id, reason] of pendingDeletes.current) void deleteConversation(id, reason);
      pendingDeletes.current.clear();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

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
  /**
   * Ações da conversa: as mesmas nos 3 pontinhos e no clique direito da lista.
   * `blocked` só vem com o detalhe carregado; até lá a opção de bloqueio fica oculta.
   */
  const conversationMenu = (conversation: ConversationItem & { blocked?: boolean }, fromList = false): FloatingMenuItem[] => {
    // As ações só rodam no clique do item, nunca durante a renderização.
    // eslint-disable-next-line react-hooks/refs
    const run = (path: string, success: string, init?: RequestInit) => void conversationAction(path, init, conversation.id, fromList ? success : undefined);
    return [
      { label: "Assumir atendimento", icon: <Hand className="h-4 w-4" />, onSelect: () => run("/assume", "Atendimento assumido"), hidden: !canWrite || !!conversation.closedAt || !!conversation.assignee },
      { label: "Ver dados do cliente", icon: <UserRound className="h-4 w-4" />, onSelect: () => setShowDetails(true) },
      { label: "Resumir atendimento (IA)", icon: <Sparkles className="h-4 w-4" />, onSelect: () => setSummaryTarget({ id: conversation.id, name: conversation.name }) },
      { label: "Agendar retorno", icon: <CalendarClock className="h-4 w-4" />, onSelect: () => setShowFollowUp(true), hidden: !canWrite },
      { label: "Criar oportunidade", icon: <Target className="h-4 w-4" />, href: `/?oportunidade=${encodeURIComponent(conversation.contactId)}&contato=${encodeURIComponent(conversation.name)}`, hidden: !canWrite },
      { label: "Transferir conversa", icon: <ArrowRightLeft className="h-4 w-4" />, onSelect: () => setShowTransfer(true), hidden: !capabilities["chat.transfer"] || !!conversation.closedAt },
      { label: "Marcar como não lida", icon: <Mail className="h-4 w-4" />, onSelect: () => run("/read", "Marcada como não lida", { body: JSON.stringify({ unread: true }) }), hidden: !!conversation.closedAt },
      { label: "Finalizar atendimento", icon: <CheckCircle2 className="h-4 w-4" />, onSelect: () => run("/close", "Atendimento finalizado"), hidden: !capabilities["chat.close"] || !!conversation.closedAt },
      { label: "Reabrir atendimento", icon: <RotateCcw className="h-4 w-4" />, onSelect: () => run("/reopen", "Atendimento reaberto"), hidden: !capabilities["chat.close"] || !canWrite || !conversation.closedAt },
      {
        label: conversation.blocked ? "Desbloquear contato" : "Bloquear contato",
        icon: <Ban className="h-4 w-4" />,
        // eslint-disable-next-line react-hooks/refs
        onSelect: () => void toggleBlock(conversation.phone, !!conversation.blocked),
        danger: true,
        hidden: !capabilities["chat.queues"] || conversation.blocked === undefined,
      },
      { label: "Excluir conversa", icon: <Trash2 className="h-4 w-4" />, onSelect: () => setDeleteTarget({ id: conversation.id, name: conversation.name, campaign: conversation.campaign?.name ?? null }), danger: true, hidden: !isAdmin },
    ];
  };
  const menuItems: FloatingMenuItem[] = open ? conversationMenu(open) : [];
  // Clique direito na lista: abre a conversa alvo (as janelas de transferir/dados usam a conversa aberta).
  const contextItem = contextMenu ? items.find((item) => item.id === contextMenu.id) : undefined;
  const contextMenuItems = contextItem ? conversationMenu(detail?.id === contextItem.id ? detail : contextItem, true) : [];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-3 py-3 md:px-4 md:py-4 xl:px-10 xl:py-8 compact:py-3">
      <div className="relative flex flex-1 min-h-0 w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/80 dark:bg-[#07194f]">
        <div className={`flex min-h-0 flex-col border-r border-slate-200 dark:border-slate-800 ${selectedId ? "hidden md:flex" : "flex"} w-full md:w-72 md:shrink-0 xl:w-80 2xl:w-96`}>
          <ConversationList
            items={hiddenIds.size ? items.filter((item) => !hiddenIds.has(item.id)) : items}
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
            onDelete={isAdmin ? (item) => setDeleteTarget({ id: item.id, name: item.name, campaign: item.campaign?.name ?? null }) : undefined}
            onContextMenu={(item, point) => {
              if (selectedId !== item.id) select(item.id);
              setContextMenu({ id: item.id, ...point });
            }}
            onEndReached={() => {
              if (nextCursor) void loadList(nextCursor);
            }}
            actions={(
              <>
                {canWrite && (
                  <button type="button" onClick={() => { setNewSearch(""); setShowNew(true); }} className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#C4D600] px-3 text-xs font-medium text-[#051647] shadow-xs transition-opacity hover:opacity-90">
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
              <div className="flex min-h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 py-2 xl:px-4 xl:py-3 compact:py-1.5 dark:border-slate-800 dark:bg-[#07194f]">
                <button type="button" onClick={() => select(null)} aria-label="Voltar" className="md:hidden cursor-pointer rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="relative shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#051647] text-sm font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">
                    {initials(open.name)}
                  </div>
                  {open.windowOpen && !open.closedAt && (
                    <span title="Janela de 24h aberta" className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#C4D600] ring-2 ring-white dark:ring-[#07194f]" />
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
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => setShowFollowUp(true)}
                      title="Agendar retorno"
                      aria-label="Agendar retorno"
                      className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 xl:h-9 xl:w-9 dark:text-slate-400 dark:hover:bg-white/10"
                    >
                      <CalendarClock className="h-5 w-5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSales(true)}
                    title="Sugestões de venda com IA para este cliente"
                    aria-label="Sugestões de venda"
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-[#C4D600] px-2.5 text-xs font-semibold text-[#051647] transition hover:bg-[#b3c400] xl:h-9"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    <span className="hidden sm:inline">Sugestões de venda</span>
                  </button>
                  <button
                    type="button"
                    onClick={togglePanel}
                    title={showPanel ? "Fechar painel do cliente" : "Painel do cliente: compras, receita, campanhas e retornos"}
                    aria-label="Painel do cliente"
                    aria-pressed={showPanel}
                    className={`grid h-8 w-8 cursor-pointer place-items-center rounded-lg transition-colors xl:h-9 xl:w-9 ${showPanel ? "bg-[#002187]/10 text-[#002187] dark:bg-[#C4D600]/15 dark:text-[#C4D600]" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"}`}
                  >
                    <PanelRight className="h-5 w-5" />
                  </button>
                  <PriorityPill key={`${open.id}-priority`} priority={open.priority} onChange={canWrite && !open.closedAt ? (value) => void updateConversation({ priority: value }) : undefined} />
                  <FloatingMenu
                    key={open.id}
                    label="Ações da conversa"
                    widthClassName="w-60"
                    triggerClassName="grid h-8 w-8 xl:h-9 xl:w-9 cursor-pointer place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
                    trigger={<MoreVertical className="h-5 w-5" />}
                    items={menuItems}
                  />
                </div>
              </div>
              <MessageList
                key={open.id}
                conversationId={open.id}
                tick={tick}
                onReply={canWrite ? setReplyTo : undefined}
                listRef={messageList}
                scheduled={scheduled}
                onCancelScheduled={canWrite ? (scheduledId) => void cancelScheduled(scheduledId) : undefined}
              />
              <Composer
                key={open.id}
                conversation={open}
                agentName={agentName}
                canWrite={canWrite}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
                onSend={handleSend}
                onTemplate={handleTemplate}
                onAttach={handleAttach}
                onError={setSendError}
                uploadProgress={uploadProgress}
                error={sendError}
                draft={composerDraft}
                onScheduled={() => {
                  toast.success("Mensagem agendada");
                  void loadScheduled(open.id);
                }}
              />
            </>
          ) : selectedId ? (
            <div className="flex flex-1 items-center justify-center"><LoadingSpinner label="Abrindo conversa..." size={32} /></div>
          ) : (
            <div className="hidden flex-1 flex-col items-center justify-center gap-4 md:flex">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#C4D600]/25">
  <MessageSquare className="h-10 w-10 text-[#051647] dark:text-[#C4D600]" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Suas conversas do WhatsApp</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Selecione uma conversa na lista à esquerda para iniciar o atendimento</p>
              </div>
            </div>
          )}
        </div>

        {showPanel && open && (
          <CustomerPanel
            key={open.id}
            conversationId={open.id}
            canWrite={canWrite}
            refreshKey={followUpKey}
            onNewFollowUp={() => setShowFollowUp(true)}
            onChanged={() => void loadList()}
            onClose={togglePanel}
          />
        )}

        {showSales && open && (
          <AiSalesDialog
            conversationId={open.id}
            customerName={open.name}
            onUsePitch={canWrite && !open.closedAt ? (text) => setComposerDraft({ text, nonce: Date.now() }) : undefined}
            onClose={() => setShowSales(false)}
          />
        )}

        {summaryTarget && (
          <AiSummaryDialog conversationId={summaryTarget.id} customerName={summaryTarget.name} onClose={() => setSummaryTarget(null)} />
        )}

        {showFollowUp && open && (
          <FollowUpDialog
            conversationId={open.id}
            customerName={open.name}
            onClose={() => setShowFollowUp(false)}
            onSaved={() => {
              setShowFollowUp(false);
              setFollowUpKey((value) => value + 1);
              toast.success("Retorno agendado", "Você recebe um aviso na hora marcada.");
              void loadList();
            }}
          />
        )}

        {showDetails && open && (
          <ContactDetailsDialog
            key={open.id}
            conversation={open}
            canWrite={canWrite}
            canTransfer={capabilities["chat.transfer"] === true}
            canBlock={capabilities["chat.queues"] === true}
            onClose={() => setShowDetails(false)}
            onTagsChange={(tags) => void updateConversation({ tags })}
            onToggleBlock={() => void toggleBlock(open.phone, open.blocked)}
            onOpenConversation={(id) => { setShowDetails(false); select(id); }}
            onTransfer={() => { setShowDetails(false); setShowTransfer(true); }}
            onNewConversation={() => { setShowDetails(false); setNewSearch(open.phone.replace(/^55/, "")); setShowNew(true); }}
          />
        )}

        {showTransfer && open && (
          <TransferDialog conversationId={open.id} currentQueueId={open.queue?.id ?? null} onClose={() => setShowTransfer(false)} onDone={() => { setShowTransfer(false); refreshOpen(); }} />
        )}

        {deleteTarget && (
          <DeleteConversationDialog conversation={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDeleteConfirmed} />
        )}

        {showNew && (
          <NewConversationDialog initialSearch={newSearch} onClose={() => setShowNew(false)} onOpened={(id) => { setShowNew(false); setTab("mine"); select(id); void loadList(); }} />
        )}
        {contextMenu && contextItem && (
          <ContextMenu
            key={`${contextMenu.id}-${contextMenu.x}-${contextMenu.y}`}
            label={`Ações da conversa com ${contextItem.name}`}
            widthClassName="w-60"
            point={contextMenu}
            items={contextMenuItems}
            onClose={() => setContextMenu(null)}
          />
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
