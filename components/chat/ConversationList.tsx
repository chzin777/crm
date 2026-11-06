"use client";
import { MessageSquare, Search, X } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { initials, relativeTime, waitingLabel } from "@/lib/chat/format";
import { PRIORITY_LABELS, type ChatPriority, type ChatTab, type ConversationItem } from "@/lib/chat/types";

const TABS: { id: ChatTab; label: string }[] = [
  { id: "queue", label: "Fila" },
  { id: "mine", label: "Meus" },
  { id: "all", label: "Todas" },
  { id: "closed", label: "Encerradas" },
];

const PRIORITY_STYLES: Record<ChatPriority, string> = {
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  normal: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  high: "bg-[#F7915E]/20 text-[#b4531f] dark:text-[#F7915E]",
  urgent: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};

const ATTACHMENT_LABELS: Record<string, string> = { image: "Imagem", video: "Vídeo", audio: "Áudio", document: "Documento", sticker: "Figurinha" };

function preview(item: ConversationItem) {
  const last = item.lastMessage;
  if (!last) return "Sem mensagens";
  const prefix = last.author === "agent" ? "Você: " : "";
  return `${prefix}${last.text || (last.attachmentKind ? ATTACHMENT_LABELS[last.attachmentKind] ?? "Anexo" : "")}`;
}

function WaitBadge({ since }: { since: string | null }) {
  const { text, minutes } = waitingLabel(since);
  if (!since) return null;
  const style = minutes >= 10
    ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
    : minutes >= 3
      ? "bg-[#F7915E]/20 text-[#b4531f] dark:text-[#F7915E]"
      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${style}`}>{text}</span>;
}

type Props = {
  items: ConversationItem[];
  counts: Record<ChatTab, number>;
  tab: ChatTab;
  onTab: (tab: ChatTab) => void;
  search: string;
  onSearch: (value: string) => void;
  queueId: string;
  onQueue: (value: string) => void;
  priority: string;
  onPriority: (value: string) => void;
  queues: { id: string; name: string }[];
  loading: boolean;
  error: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEndReached: () => void;
  actions?: React.ReactNode;
};

export function ConversationList({ items, counts, tab, onTab, search, onSearch, queueId, onQueue, priority, onPriority, queues, loading, error, selectedId, onSelect, onEndReached, actions }: Props) {
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const list = event.currentTarget;
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 200) onEndReached();
  };
  const hasFilters = !!queueId || !!priority;
  const selectClass = "h-8 min-w-0 flex-1 cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white";

  return (
    <>
      <div className="shrink-0 space-y-3 border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Buscar conversa..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition-colors focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
            />
          </div>
          {actions}
        </div>
        <div className="flex gap-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => onTab(id)}
              className={`flex-1 whitespace-nowrap rounded-md px-1.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                tab === id
                  ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
              }`}
            >
              {label} <span className="opacity-70">{counts[id]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select aria-label="Filtrar por fila" value={queueId} onChange={(event) => onQueue(event.target.value)} className={selectClass}>
            <option value="">Todas as filas</option>
            {queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
          </select>
          <select aria-label="Filtrar por prioridade" value={priority} onChange={(event) => onPriority(event.target.value)} className={selectClass}>
            <option value="">Prioridade</option>
            {(Object.keys(PRIORITY_LABELS) as ChatPriority[]).map((key) => <option key={key} value={key}>{PRIORITY_LABELS[key]}</option>)}
          </select>
          {hasFilters && (
            <button
              type="button"
              title="Limpar filtros"
              aria-label="Limpar filtros"
              onClick={() => { onQueue(""); onPriority(""); }}
              className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" onScroll={handleScroll}>
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <LoadingSpinner label="Carregando conversas..." size={32} />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-slate-500 dark:text-slate-400">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <p className="text-sm">{error ? "Não foi possível carregar as conversas" : "Nenhuma conversa aqui"}</p>
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`flex w-full items-center gap-3 border-b border-slate-100 p-4 text-left transition-colors cursor-pointer hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-white/5 ${selectedId === item.id ? "bg-slate-100 dark:bg-white/10" : ""}`}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#051647] text-sm font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">
                {initials(item.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{item.name}</span>
                  <span className="shrink-0 text-[10px] text-slate-500 dark:text-slate-400">{relativeTime(item.lastMessageAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{preview(item)}</p>
                  {item.unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25D366] px-1.5 text-[10px] font-bold text-white">{item.unreadCount}</span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  {item.status === "waiting" && <WaitBadge since={item.waitingSince} />}
                  {item.priority !== "normal" && <span className={`rounded px-1.5 py-0.5 font-semibold ${PRIORITY_STYLES[item.priority]}`}>{PRIORITY_LABELS[item.priority]}</span>}
                  {item.queue && (
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.queue.color }} />
                      {item.queue.name}
                    </span>
                  )}
                  {item.assignee && <span>· {item.assignee.name}</span>}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </>
  );
}
