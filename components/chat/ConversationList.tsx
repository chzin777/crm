"use client";
import type { ReactNode } from "react";
import { AlertCircle, Check, CheckCheck, ChevronDown, Clock, Megaphone, MessageSquare, Mic, Search, SearchX, ShoppingBag, Smile, Trash2, X } from "lucide-react";
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

const ATTACHMENT_LABELS: Record<string, string> = { image: "Imagem", video: "Vídeo", audio: "Áudio", document: "Documento", sticker: "Figurinha" };

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6];

function preview(item: ConversationItem) {
  const last = item.lastMessage;
  if (!last) return "Sem mensagens";
  const prefix = last.author === "agent" && !last.delivery ? "Você: " : "";
  return `${prefix}${last.text || (last.attachmentKind ? ATTACHMENT_LABELS[last.attachmentKind] ?? "Anexo" : "")}`;
}

/** Mídia cujo download falhou fica gravada só com o rótulo do tipo. */
const isSticker = (item: ConversationItem) => item.lastMessage?.attachmentKind === "sticker" || item.lastMessage?.text === "[Figurinha]";
const isAudio = (item: ConversationItem) => item.lastMessage?.attachmentKind === "audio" || item.lastMessage?.text === "[Áudio]";

function storeLabel(store: string) {
  const value = store.trim();
  return /^\d+$/.test(value) ? `Loja ${value}` : value;
}

function DeliveryIcon({ delivery }: { delivery: ChatDelivery }) {
  const className = "h-3.5 w-3.5 shrink-0";
  if (delivery === "sending") return <Clock className={`${className} text-slate-400`} aria-label="Enviando" />;
  if (delivery === "sent") return <Check className={`${className} text-slate-400`} aria-label="Enviada" />;
  if (delivery === "delivered") return <CheckCheck className={`${className} text-slate-400`} aria-label="Entregue" />;
  if (delivery === "read") return <CheckCheck className={`${className} text-[#002187] dark:text-[#C4D600]`} aria-label="Lida" />;
  return <AlertCircle className={`${className} text-red-500`} aria-label="Falha no envio" />;
}

/** Tag de origem com cor própria: campanha violeta, e-commerce verde, demais etiquetas neutras. */
type OriginTone = "campaign" | "ecommerce" | "neutral";

const ORIGIN_TONES: Record<OriginTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
  campaign: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-950/40 dark:text-violet-300",
  ecommerce: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300",
};

const ECOMMERCE_TAG = /e-?commerce|site|pedido|loja online/i;

type Origin = { title: string; text: string; tone: OriginTone; icon?: ReactNode };

/** Uma única tag de origem no card: a campanha tem preferência; senão a primeira etiqueta. */
function originOf(item: ConversationItem): Origin | null {
  if (item.campaign) return { title: `Respondeu à campanha: ${item.campaign.name}`, text: item.campaign.name, tone: "campaign", icon: <Megaphone className="h-3 w-3 shrink-0" /> };
  const tag = item.tags.find((value) => ECOMMERCE_TAG.test(value)) ?? item.tags[0];
  if (!tag) return null;
  const ecommerce = ECOMMERCE_TAG.test(tag);
  return { title: tag, text: tag, tone: ecommerce ? "ecommerce" : "neutral", icon: ecommerce ? <ShoppingBag className="h-3 w-3 shrink-0" /> : undefined };
}

/** Tempo no canto do card: na fila mostra há quanto espera (cor sobe com a demora), senão a última mensagem. */
function cornerTime(item: ConversationItem, waiting: boolean) {
  if (!waiting || !item.waitingSince) return { text: relativeTime(item.lastMessageAt), title: undefined, tone: "text-slate-400 dark:text-slate-500" };
  const { text, minutes } = waitingLabel(item.waitingSince);
  const tone = minutes >= 10 ? "text-rose-600 dark:text-rose-300" : minutes >= 3 ? "text-amber-600 dark:text-amber-300" : "text-slate-400 dark:text-slate-500";
  return { text, title: `Esperando há ${text}`, tone };
}

const PRIORITY_DOTS: Partial<Record<ChatPriority, string>> = { low: "bg-slate-300 dark:bg-slate-600", high: "bg-amber-500", urgent: "bg-rose-500" };

function ListSkeleton() {
  return (
    <div role="status" aria-label="Carregando conversas" className="animate-pulse">
      {SKELETON_ROWS.map((row) => (
        <div key={row} className="mx-2 my-1 flex h-[84px] items-center gap-3 border-l-4 border-transparent px-3 py-2.5">
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
  /** Clique direito no card: mesmas ações dos 3 pontinhos, no ponto do mouse. */
  onContextMenu?: (item: ConversationItem, point: { x: number; y: number }) => void;
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
      triggerClassName={`flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-xl border bg-white px-3 text-xs font-medium text-slate-700 outline-none transition-all hover:bg-slate-50 focus:border-[#002187] dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700/50 dark:focus:border-[#C4D600] ${value ? "border-[#C4D600]" : "border-slate-200/80 dark:border-slate-700/80"}`}
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

export function ConversationList({ items, counts, tab, onTab, search, onSearch, queueId, onQueue, priority, onPriority, queues, loading, error, selectedId, onSelect, onDelete, onContextMenu, onEndReached, actions }: Props) {
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
            <span title="Conversas não lidas" className="rounded-full bg-[#C4D600] px-2 py-0.5 text-[11px] font-semibold text-[#051647]">{counts.unread}</span>
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
            const origin = originOf(item);
            const corner = cornerTime(item, waiting);
            const priorityDot = PRIORITY_DOTS[item.priority];
            const operational = [item.queue?.name, item.store ? storeLabel(item.store) : null].filter((value): value is string => !!value);
            return (
              <div
                key={item.id}
                className="group relative mx-2 my-1"
                onContextMenu={onContextMenu ? (event) => {
                  event.preventDefault();
                  onContextMenu(item, { x: event.clientX, y: event.clientY });
                } : undefined}
              >
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={selected ? "true" : undefined}
                  className={`flex h-[84px] w-full cursor-pointer items-center gap-3 overflow-hidden rounded-xl border-l-4 p-2.5 text-left transition-all duration-150 ${
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
                      <span title="Janela de 24h aberta" className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#C4D600] ring-2 ring-white dark:ring-[#07194f]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {priorityDot && (
                          <span title={`Prioridade ${PRIORITY_LABELS[item.priority].toLowerCase()}`} className={`h-2 w-2 shrink-0 rounded-full ${priorityDot}`}>
                            <span className="sr-only">Prioridade {PRIORITY_LABELS[item.priority].toLowerCase()}</span>
                          </span>
                        )}
                        <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{item.name}</span>
                      </span>
                      <span title={corner.title} className={`shrink-0 text-xs tabular-nums ${corner.tone}`}>{corner.text}</span>
                    </div>
                    {/* Com lixeira, a linha da prévia reserva o canto dela ao passar o mouse. */}
                    <div className={`mt-0.5 flex items-center gap-1.5 ${onDelete ? "transition-[padding] group-hover:pr-7" : ""}`}>
                      {delivery && <DeliveryIcon delivery={delivery} />}
                      <p className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">
                        {isSticker(item) ? (
                          <span className="inline-flex items-center gap-1"><Smile className="h-3.5 w-3.5" />Figurinha</span>
                        ) : isAudio(item) ? (
                          <span className="inline-flex items-center gap-1"><Mic className="h-3.5 w-3.5" />Áudio</span>
                        ) : preview(item)}
                      </p>
                      {item.unreadCount > 0 && (
                        <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#C4D600] px-1 text-[10px] font-bold text-[#051647]">{item.unreadCount}</span>
                      )}
                    </div>
                    {/* Linha 3 (altura fixa): origem colorida à esquerda, fila • loja em texto à direita, sempre visíveis. */}
                    <div className="mt-1.5 flex h-6 min-w-0 items-center justify-between gap-2 overflow-hidden">
                      {origin ? (
                        <span title={origin.title} className={`inline-flex h-6 min-w-[72px] max-w-[150px] shrink items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium ${ORIGIN_TONES[origin.tone]}`}>
                          {origin.icon}
                          <span className="truncate">{origin.text}</span>
                        </span>
                      ) : <span />}
                      {operational.length > 0 && (
                        <span
                          title={[item.queue && `Fila: ${item.queue.name}`, item.store && storeLabel(item.store), item.assignee && `Atendente: ${item.assignee.name}`].filter(Boolean).join("\n")}
                          className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-normal text-slate-400 dark:text-slate-500"
                        >
                          {item.queue && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.queue.color }} />}
                          <span className="truncate">{operational.join(" • ")}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(item)}
                    title="Excluir conversa"
                    aria-label={`Excluir conversa com ${item.name}`}
                    className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-slate-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-red-500/10 dark:hover:text-red-300"
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
