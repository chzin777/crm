"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  MessageSquare,
  Send,
  Paperclip,
  Smile,
  Mic,
  ArrowLeft,
  Check,
  CheckCheck,
  Phone,
  Info,
  Image as ImageIcon,
  FileIcon,
  Play,
} from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { EntityDialog } from "@/components/EntityDialog";

type Conversation = {
  contactId: string;
  name: string;
  phone: string;
  email: string | null;
  segment: string | null;
  category: string;
  lastMessageText: string | null;
  lastMessageTime: string;
  lastMessageDirection: "in" | "out";
  lastMessageStatus: string | null;
  lastMessageMediaType: string | null;
  unreadCount: number;
};

type TimelineItem = {
  id: string;
  direction: "in" | "out";
  text: string | null;
  mediaType: string | null;
  timestamp: string;
  status: string | null;
};

type FilterType = "all" | "unread" | "attending";

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Agora";
  if (diffMin < 60) return `${diffMin}min`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function StatusCheck({ status }: { status: string | null }) {
  if (!status) return null;
  if (status === "read" || status === "replied") {
    return <CheckCheck className="h-3.5 w-3.5 text-[#25D366]" />;
  }
  if (status === "delivered") {
    return <CheckCheck className="h-3.5 w-3.5 text-slate-400" />;
  }
  if (status === "sent") {
    return <Check className="h-3.5 w-3.5 text-slate-400" />;
  }
  return null;
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedConversation = conversations.find((c) => c.contactId === selectedContactId);

  const loadConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filter !== "all") params.set("filter", filter);
      const res = await fetch(`/api/chat/conversations?${params}`);
      if (res.ok) {
        setConversations(await res.json());
      }
    } catch (err) {
      console.error("[chat] falha ao carregar conversas:", err);
    } finally {
      setLoadingList(false);
    }
  }, [search, filter]);

  const loadHistory = useCallback(async (contactId: string) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/chat/history?contactId=${contactId}`);
      if (res.ok) {
        setTimeline(await res.json());
      }
    } catch (err) {
      console.error("[chat] falha ao carregar histórico:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (selectedContactId) {
      loadHistory(selectedContactId);
    }
  }, [selectedContactId, loadHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timeline]);

  const handleSelectConversation = (contactId: string) => {
    setSelectedContactId(contactId);
    setMobileView("chat");
  };

  const handleBackToList = () => {
    setMobileView("list");
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversation?.phone || sending) return;

    setSending(true);
    try {
      const formData = new FormData();
      formData.append("phone", selectedConversation.phone);
      formData.append("text", messageInput.trim());

      const res = await fetch("/api/whatsapp/send", { method: "POST", body: formData });
      if (res.ok) {
        setMessageInput("");
        const optimisticMsg: TimelineItem = {
          id: `opt-${Date.now()}`,
          direction: "out",
          text: messageInput.trim(),
          mediaType: null,
          timestamp: new Date().toISOString(),
          status: "sent",
        };
        setTimeline((prev) => [...prev, optimisticMsg]);
        loadConversations();
      } else {
        const data = await res.json().catch(() => ({ error: "Falha ao enviar" }));
        alert(data.error || "Falha ao enviar mensagem");
      }
    } catch (err) {
      console.error("[chat] erro ao enviar:", err);
      alert("Erro de conexão ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConversation?.phone) return;

    setSending(true);
    try {
      const formData = new FormData();
      formData.append("phone", selectedConversation.phone);
      formData.append("files", file);
      formData.append("text", messageInput.trim() || "");

      const res = await fetch("/api/whatsapp/send", { method: "POST", body: formData });
      if (res.ok) {
        setMessageInput("");
        loadHistory(selectedConversation.contactId);
        loadConversations();
      } else {
        const data = await res.json().catch(() => ({ error: "Falha ao enviar anexo" }));
        alert(data.error || "Falha ao enviar anexo");
      }
    } catch (err) {
      console.error("[chat] erro ao enviar arquivo:", err);
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#07194f]">
      {/* Coluna Esquerda - Lista de Conversas */}
      <div
        className={`flex flex-col border-r border-slate-200 dark:border-slate-800 ${
          mobileView === "chat" ? "hidden md:flex" : "flex"
        } w-full md:w-[35%] lg:w-[35%]`}
      >
        {/* Header da Lista */}
        <div className="shrink-0 space-y-3 border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar contato..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition-colors focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "unread", "attending"] as FilterType[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  filter === f
                    ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                {f === "all" ? "Todas" : f === "unread" ? "Não lidas" : "Atendendo"}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de Conversas */}
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="flex h-40 items-center justify-center">
              <LoadingSpinner label="Carregando conversas..." size={32} />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-slate-500 dark:text-slate-400">
              <MessageSquare className="h-8 w-8 opacity-40" />
              <p className="text-sm">Nenhuma conversa encontrada</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.contactId}
                type="button"
                onClick={() => handleSelectConversation(conv.contactId)}
                className={`flex w-full items-center gap-3 border-b border-slate-100 p-4 text-left transition-colors cursor-pointer hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-white/5 ${
                  selectedContactId === conv.contactId
                    ? "bg-slate-100 dark:bg-white/10"
                    : ""
                }`}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#051647] text-sm font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">
                  {getInitials(conv.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {conv.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-500 dark:text-slate-400">
                      {formatRelativeTime(conv.lastMessageTime)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {conv.lastMessageDirection === "out" && (
                        <span className="mr-1 inline-flex items-center">
                          <StatusCheck status={conv.lastMessageStatus} />
                        </span>
                      )}
                      {conv.lastMessageText || "Sem mensagens"}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25D366] px-1.5 text-[10px] font-bold text-white">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Coluna Direita - Chat Ativo */}
      <div
        className={`flex flex-1 flex-col ${
          mobileView === "list" ? "hidden md:flex" : "flex"
        }`}
      >
        {selectedConversation ? (
          <>
            {/* Header do Chat */}
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#07194f]">
              <button
                type="button"
                onClick={handleBackToList}
                className="md:hidden cursor-pointer rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#051647] text-sm font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">
                {getInitials(selectedConversation.name)}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {selectedConversation.name}
                </h3>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {formatPhone(selectedConversation.phone)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Ligar"
                  className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <Phone className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Detalhes do contato"
                  onClick={() => setShowDetails(true)}
                  className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <Info className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Área de Mensagens */}
            <div className="flex-1 overflow-y-auto bg-[#efe7dd]/30 p-4 dark:bg-[#0b1a3a]">
              {loadingHistory ? (
                <div className="flex h-full items-center justify-center">
                  <LoadingSpinner label="Carregando mensagens..." size={40} />
                </div>
              ) : timeline.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-slate-500 dark:text-slate-400">
                  <MessageSquare className="h-10 w-10 opacity-30" />
                  <p className="text-sm">Inicie a conversa enviando uma mensagem</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {timeline.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === "out" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                          msg.direction === "out"
                            ? "rounded-br-sm bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]"
                            : "rounded-bl-sm border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        }`}
                      >
                        {msg.mediaType && (
                          <div className="mb-2 flex items-center gap-2 rounded-lg bg-black/10 p-2">
                            {msg.mediaType.startsWith("image") ? (
                              <ImageIcon className="h-5 w-5 opacity-70" />
                            ) : msg.mediaType.startsWith("audio") ? (
                              <div className="flex items-center gap-2">
                                <button type="button" className="cursor-pointer">
                                  <Play className="h-4 w-4" />
                                </button>
                                <div className="h-1 w-24 rounded-full bg-current opacity-30" />
                              </div>
                            ) : (
                              <FileIcon className="h-5 w-5 opacity-70" />
                            )}
                            <span className="text-xs opacity-80">{msg.mediaType}</span>
                          </div>
                        )}
                        {msg.text && <p className="text-sm leading-relaxed">{msg.text}</p>}
                        <div className={`mt-1 flex items-center gap-1 text-[10px] opacity-70 ${msg.direction === "out" ? "justify-end" : "justify-start"}`}>
                          <span>{formatTime(msg.timestamp)}</span>
                          {msg.direction === "out" && <StatusCheck status={msg.status} />}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Rodapé de Input */}
            <div className="shrink-0 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#07194f]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="Emojis"
                  className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <Smile className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  title="Anexar arquivo"
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <Paperclip className="h-5 w-5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept="image/*,video/*,application/pdf"
                />
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Digite uma mensagem..."
                  disabled={sending}
                  className="h-10 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition-colors focus:border-[#002187] disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
                />
                {messageInput.trim() ? (
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={sending}
                    className="cursor-pointer rounded-lg bg-[#051647] p-2.5 text-white transition-colors hover:bg-[#002187] disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#b3c400]"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    title="Gravar áudio"
                    className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <Mic className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Estado vazio - nenhuma conversa selecionada (desktop) */
          <div className="hidden flex-1 flex-col items-center justify-center gap-4 md:flex">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#25D366]/10">
              <MessageSquare className="h-10 w-10 text-[#25D366]" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Suas conversas do WhatsApp</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Selecione um contato na lista à esquerda para iniciar o atendimento</p>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Detalhes do Contato */}
      {showDetails && selectedConversation && (
        <EntityDialog
          titleId="contact-details-title"
          title={selectedConversation.name}
          description="Detalhes do contato"
          onClose={() => setShowDetails(false)}
        >
          <div className="space-y-4 overflow-y-auto p-1">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#051647] text-xl font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">
                {getInitials(selectedConversation.name)}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{selectedConversation.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{formatPhone(selectedConversation.phone)}</p>
                {selectedConversation.email && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{selectedConversation.email}</p>
                )}
              </div>
            </div>
            <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Categoria</span>
                <span className="font-medium text-slate-900 dark:text-white capitalize">{selectedConversation.category}</span>
              </div>
              {selectedConversation.segment && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Segmento</span>
                  <span className="font-medium text-slate-900 dark:text-white">{selectedConversation.segment}</span>
                </div>
              )}
            </div>
          </div>
        </EntityDialog>
      )}
    </div>
  );
}