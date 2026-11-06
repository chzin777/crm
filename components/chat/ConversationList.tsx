"use client";
import type { ReactNode } from "react";
import { AlertCircle, Check, CheckCheck, ChevronDown, Clock, Megaphone, MessageSquare, Search, SearchX, Smile, Store, Trash2, User, X } from "lucide-react";
import { FloatingMenu } from "@/components/chat/FloatingMenu";
import { initials, relativeTime, waitingLabel } from "@/lib/chat/format";
import { PRIORITY_LABELS, type ChatDelivery, type ChatPriority, type ChatTab, type ConversationItem } from "@/lib/chat/types";

const TABS: { id: ChatTab; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "unread", label: "Não lidas" },
  { id: "mine", label: "Minhas" },
  { id: "campaigns", label: "Campanhas" },
  { id: "queue", label: "Fila" },
  { id: "closed", label: "Encerradas" },
];

const PRIORITY_STYLES: Record<ChatPriority, string> = {
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  normal: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  high: "bg-[#F7915E]/20 text-[#b4531f] dark:text-[#F7915E]",
  urgent: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};

const ATTACHMENT_LABELS: Record<string, string> = { image: "Imagem", video: "Vídeo", audio: "Áudio", document: "Documento", sticker: "Figurinha" };

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6];

function preview(item: ConversationItem) {
  const last = item.lastMessage;
  if (!last) return "Sem mensagens";
  const prefix = last.author === "agent" && !last.delivery ? "Você: " : "";
  return `${prefix}${last.text || (last.attachmentKind ? ATTACHMENT_LABELS[last.attachmentKind] ?? "Anexo" : "")}`;
}

/** Figurinha cujo download falhou fica gravada só com o rótulo do tipo. */
const isSticker = (item: ConversationItem) => item.lastMessage?.attachmentKind === "sticker" || item.lastMessage?.text === "[Figurinha]";

function storeLabel(store: string) {
  const value = store.trim();
  return /^\d+$/.test(value) ? `Loja ${value}` : value;
}

function DeliveryIcon({ delivery }: { delivery: ChatDelivery }) {
  const className = "h-3.5 w-3.5 shrink-0";
  if (delivery === "sending") return <Clock className={`${className} text-slate-400`} aria-label="Enviando" />;
  if (delivery === "sent") return <Check className={`${className} text-slate-400`} aria-label="Enviada" />;
  if (delivery === "delivered") return <CheckCheck className={`${className} text-slate-400`} aria-label="Entregue" />;
  if (delivery === "read") return <CheckCheck className={`${className} text-emerald-600 dark:text-[#25D366]`} aria-label="Lida" />;
  return <AlertCircle className={`${className} text-red-500`} aria-label="Falha no envio" />;
}

function ContextTag({ title, children }: { title?: string; children: ReactNode }) {
  return <span title={title} className="inline-flex max-w-[140px] items-center gap-1 truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">{children}</span>;
}

function WaitBadge({ since }: { since: string | null }) {
  const { text, minutes } = waitingLabel(since);
  if (!since) return null;
  const style = minutes >= 10
    ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
    : minutes >= 3
      ? "bg-[#F7915E]/20 text-[#b4531f] dark:text-[#F7915E]"
      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${style}`}>{text}</span>;
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Carregando conversas" className="animate-pulse">
      {SKELETON_ROWS.map((row) => (
        <div key={row} className="mx-2 my-1 flex items-center gap-3 border-l-4 border-transparent px-3 py-3">
          <div className="h-11 w-11 shrink-0 rounded-full bg-slate-200 dark:bg-slate-800" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-6">
              <div className="h-3 w-2/5 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-2.5 w-8 rounded bg-slate-200 dark:bg-slate-800" />
            </div>
            <div className="h-2.5 w-4/5 rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  );
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
  onDelete?: (item: ConversationItem) => void;
  onEndReached: () => void;
  actions?: React.ReactNode;
};

type FilterSelectProps = {
  label: string;
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

function FilterSelect({ label, value, placeholder, options, onChange }: FilterSelectProps) {
  const selected = value ? options.find((option) => option.value === value)?.label : undefined;
  const text = selected ?? placeholder;
  return (
    <FloatingMenu
      label={`${label}: ${text}`}
      align="left"
      compact
      widthClassName="w-52 min-w-[140px]"
      triggerClassName={`flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-xl border bg-white px-3 text-xs font-medium text-slate-700 outline-none transition-all hover:bg-slate-50 focus:border-[#002187] dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700/50 dark:focus:border-[#C4D600] ${value ? "border-emerald-500 dark:border-[#C4D600]/70" : "border-slate-200/80 dark:border-slate-700/80"}`}
      trigger={(
        <>
          <span className="min-w-0 flex-1 truncate text-left">{text}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        </>
      )}
      items={options.map((option) => ({
        label: option.label,
        checked: option.value === value,
        onSelect: () => onChange(option.value),
      }))}
    />
  );
}

export function ConversationList({ items, counts, tab, onTab, search, onSearch, queueId, onQueue, priority, onPriority, queues, loading, error, selectedId, onSelect, onDelete, onEndReached, actions }: Props) {
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const list = event.currentTarget;
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 200) onEndReached();
  };
  const hasFilters = !!queueId || !!priority;

  return (
    <>
      <div className="shrink-0 space-y-3 border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Conversas</h2>
          {counts.unread > 0 && (
            <span title="Conversas não lidas" className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">{counts.unread}</span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Buscar conversa..."
            aria-label="Buscar conversa"
            className="h-9 w-full rounded-xl border border-transparent bg-slate-100/80 px-3 pl-9 text-xs outline-none transition-all focus:border-[#002187] dark:bg-slate-800/80! dark:text-white dark:focus:border-[#C4D600]"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => onTab(id)}
              className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                tab === id
                  ? "bg-[#C4D600] text-[#051647]"
                  : "bg-transparent text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
              }`}
            >
              {label} <span className="opacity-70">{counts[id]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <FilterSelect
            label="Filtrar por fila"
            value={queueId}
            placeholder="Todas as filas"
            options={[{ value: "", label: "Todas as filas" }, ...queues.map((queue) => ({ value: queue.id, label: queue.name }))]}
            onChange={onQueue}
          />
          <FilterSelect
            label="Filtrar por prioridade"
            value={priority}
            placeholder="Prioridade"
            options={[{ value: "", label: "Todas as prioridades" }, ...(Object.keys(PRIORITY_LABELS) as ChatPriority[]).map((key) => ({ value: key, label: PRIORITY_LABELS[key] }))]}
            onChange={onPriority}
          />
          {hasFilters && (
            <button
              type="button"
              title="Limpar filtros"
              aria-label="Limpar filtros"
              onClick={() => { onQueue(""); onPriority(""); }}
              className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1" onScroll={handleScroll}>
        {loading ? (
          <ListSkeleton />
        ) : items.length === 0 ? (
          search.trim() && !error ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center text-slate-500 dark:text-slate-400">
              <SearchX className="h-8 w-8 opacity-40" />
              <p className="text-sm">Nenhuma conversa encontrada</p>
              <button type="button" onClick={() => onSearch("")} className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium text-[#002187] transition-colors hover:bg-slate-100 dark:text-[#C4D600] dark:hover:bg-white/5">Limpar busca</button>
            </div>
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-slate-500 dark:text-slate-400">
              <MessageSquare className="h-8 w-8 opacity-40" />
              <p className="text-sm">{error ? "Não foi possível carregar as conversas" : "Nenhuma conversa aqui"}</p>
            </div>
          )
        ) : (
          items.map((item) => {
            const selected = selectedId === item.id;
            const delivery = item.lastMessage && item.lastMessage.author !== "customer" ? item.lastMessage.delivery : null;
            const waiting = item.status === "waiting" && !!item.waitingSince;
            const hasTags = !!item.campaign || !!item.store || waiting || item.priority !== "normal" || !!item.queue || !!item.assignee;
            return (
              <div key={item.id} className="group relative mx-2 my-1">
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={selected ? "true" : undefined}
                  className={`flex w-full cursor-pointer items-start gap-3 rounded-xl border-l-4 px-3 py-3 text-left transition-all duration-150 ${
                    selected
                      ? "border-[#051647] bg-blue-50/70 shadow-xs dark:border-[#C4D600] dark:bg-white/10"
                      : "border-transparent hover:bg-slate-100/70 dark:hover:bg-white/5"
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#051647]/10 bg-gradient-to-br from-[#051647] to-[#002187] text-sm font-bold text-white dark:border-white/10 dark:from-slate-700 dark:to-slate-800 dark:text-[#C4D600]">
                      {initials(item.name)}
                    </div>
                    {item.windowOpen && !item.closedAt && (
                      <span title="Janela de 24h aberta" className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#25D366] ring-2 ring-white dark:ring-[#07194f]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{item.name}</span>
                      <span className={`shrink-0 text-[11px] font-medium text-slate-400 dark:text-slate-500 ${onDelete ? "group-hover:invisible" : ""}`}>{relativeTime(item.lastMessageAt)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {delivery && <DeliveryIcon delivery={delivery} />}
                      <p className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">
                        {isSticker(item) ? <span className="inline-flex items-center gap-1"><Smile className="h-3.5 w-3.5" />Figurinha</span> : preview(item)}
                      </p>
                      {item.unreadCount > 0 && (
                        <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#25D366] px-1 text-[10px] font-bold text-[#051647] dark:bg-[#C4D600]">{item.unreadCount}</span>
                      )}
                    </div>
                    {hasTags && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {waiting && <WaitBadge since={item.waitingSince} />}
                        {item.priority !== "normal" && <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${PRIORITY_STYLES[item.priority]}`}>{PRIORITY_LABELS[item.priority]}</span>}
                        {item.campaign && <ContextTag title={`Respondeu à campanha: ${item.campaign.name}`}><Megaphone className="h-3 w-3 shrink-0" /><span className="truncate">{item.campaign.name}</span></ContextTag>}
                        {item.store && <ContextTag title={storeLabel(item.store)}><Store className="h-3 w-3 shrink-0" /><span className="truncate">{storeLabel(item.store)}</span></ContextTag>}
                        {item.queue && <ContextTag title={`Fila: ${item.queue.name}`}><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.queue.color }} /><span className="truncate">{item.queue.name}</span></ContextTag>}
                        {item.assignee && <ContextTag title={`Atendente: ${item.assignee.name}`}><User className="h-3 w-3 shrink-0" /><span className="truncate">{item.assignee.name}</span></ContextTag>}
                      </div>
                    )}
                  </div>
                </button>
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(item)}
                    title="Excluir conversa"
                    aria-label={`Excluir conversa com ${item.name}`}
                    className="absolute right-2 top-2 grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
