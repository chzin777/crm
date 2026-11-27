"use client";
import { useRef, useState, type ReactNode } from "react";
import { prefetchMessages } from "@/lib/chat/message-cache";
import { AlertCircle, CalendarClock, Check, CheckCheck, ChevronDown, Clock, Crown, Hourglass, Megaphone, Timer, MessageSquare, Mic, Search, SearchX, ShieldCheck, ShoppingBag, SlidersHorizontal, Smile, Trash2, X } from "lucide-react";
import { FloatingMenu } from "@/components/chat/FloatingMenu";
import { AttendantFilter, type Attendant } from "@/components/chat/AttendantFilter";
import { displayName, initials, relativeTime, waitingLabel } from "@/lib/chat/format";
import { PRIORITY_LABELS, SLA_BREACH_MINUTES, SLA_WARN_MINUTES, type ChatCounts, type ChatDelivery, type ChatPriority, type ChatTab, type ConversationItem } from "@/lib/chat/types";

/** Abas principais sempre visíveis numa linha; as demais ficam no "Mais". */
const MAIN_TABS: { id: ChatTab; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "unread", label: "Não lidas" },
  { id: "mine", label: "Minhas" },
];
const MORE_TABS: { id: ChatTab; label: string }[] = [
  // Conversas na fila esperando atendente; a fila/setor fica no filtro de filas.
  { id: "queue", label: "Aguardando" },
  { id: "campaigns", label: "Campanhas" },
  { id: "followups", label: "Lembretes" },
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
type OriginTone = "campaign" | "ecommerce" | "neutral" | "followup" | "overdue" | "financial";

/** Linha 3 do card: só texto suave, com cor apenas nos alertas (aprovação financeira e retorno). */
const ORIGIN_TONES: Record<OriginTone, string> = {
  financial: "font-semibold text-[#c25a26] dark:text-[#F7915E]",
  followup: "font-medium text-[#002187] dark:text-[#C4D600]",
  overdue: "font-semibold text-rose-600 dark:text-rose-300",
  neutral: "text-slate-400 dark:text-slate-500",
  campaign: "text-violet-600 dark:text-violet-300",
  ecommerce: "text-emerald-600 dark:text-emerald-400",
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

/** Tempo no canto do card: na fila mostra há quanto espera (até 10 min normal, até 20 alerta, acima fora do prazo). */
function cornerTime(item: ConversationItem, waiting: boolean) {
  if (!waiting || !item.waitingSince) return { text: relativeTime(item.lastMessageAt), title: undefined, tone: "text-slate-400 dark:text-slate-500" };
  const { text, minutes } = waitingLabel(item.waitingSince);
  if (minutes >= SLA_BREACH_MINUTES) {
    return { text, title: `Fora do prazo: esperando há ${text}`, tone: "animate-pulse rounded-md bg-rose-100 px-1.5 font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-200" };
  }
  const tone = minutes >= SLA_WARN_MINUTES ? "font-medium text-amber-600 dark:text-amber-300" : "text-slate-400 dark:text-slate-500";
  return { text, title: `Esperando há ${text}`, tone };
}

const dueLabel = (value: string) => new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Parcelas consultadas pela IA esperando o operador conferir: selo mais urgente da linha 3. */
function financialOf(item: ConversationItem): Origin | null {
  return item.financialApprovalPending ? { title: "A IA consultou as parcelas no VMSet e aguarda você conferir antes de enviar", text: "Aprovação financeira", tone: "financial", icon: <Hourglass className="h-3 w-3 shrink-0" /> } : null;
}

/** Lembrete de retorno pendente vira o selo da linha 3 (mais urgente que a origem). */
function followUpOf(item: ConversationItem): Origin | null {
  if (!item.followUp) return null;
  const overdue = new Date(item.followUp.dueAt).getTime() <= Date.now();
  const when = dueLabel(item.followUp.dueAt);
  return {
    title: `${overdue ? "Retorno atrasado" : "Retorno agendado"}: ${when}${item.followUp.note ? `\n${item.followUp.note}` : ""}`,
    text: `${overdue ? "Atrasado" : "Retorno"} ${when}`,
    tone: overdue ? "overdue" : "followup",
    icon: <CalendarClock className="h-3 w-3 shrink-0" />,
  };
}

/** Avatar com cor fixa por contato (mesmo cliente, mesma cor), em vez de todos azul-marinho. */
const AVATAR_TONES = [
  "from-indigo-400 to-indigo-600 text-white",
  "from-emerald-400 to-emerald-600 text-white",
  "from-amber-300 to-amber-500 text-amber-950",
  "from-sky-400 to-sky-600 text-white",
  "from-violet-400 to-violet-600 text-white",
  "from-rose-400 to-rose-600 text-white",
  "from-teal-400 to-teal-600 text-white",
  "from-[#002187] to-[#051647] text-[#C4D600]",
];

function hashOf(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

const avatarTone = (key: string) => AVATAR_TONES[hashOf(key) % AVATAR_TONES.length];

/** Pílula da fila com cor pelo setor: Vendas verde, Financeiro índigo, Atendimento/Geral âmbar; demais por nome. */
const QUEUE_TONES = [
  "border-sky-200/70 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300",
  "border-violet-200/70 bg-violet-50 text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300",
  "border-rose-200/70 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300",
  "border-teal-200/70 bg-teal-50 text-teal-700 dark:border-teal-400/20 dark:bg-teal-400/10 dark:text-teal-300",
];

function queueTone(name: string) {
  const value = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/venda|comercial/.test(value)) return "border-emerald-200/70 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300";
  if (/financ|credi|cobranc/.test(value)) return "border-indigo-200/70 bg-indigo-50 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300";
  if (/geral|atendimento|recep/.test(value)) return "border-amber-200/70 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300";
  return QUEUE_TONES[hashOf(value) % QUEUE_TONES.length];
}

const PRIORITY_DOTS: Partial<Record<ChatPriority, string>> = { low: "bg-slate-300 dark:bg-slate-600", high: "bg-amber-500", urgent: "bg-rose-500" };

/** Pódio da fila (aba Aguardando): 1º destaque máximo (próximo a puxar), 2º intermediário, 3º discreto. */
const PODIUM: Record<number, { card: string; badge: string; title: string }> = {
  1: { card: "border-[#C4D600] bg-[#C4D600]/15 shadow-xs ring-1 ring-[#C4D600]/40 hover:bg-[#C4D600]/20 dark:bg-[#C4D600]/10", badge: "bg-[#C4D600] text-[#051647]", title: "Próximo cliente a ser atendido" },
  2: { card: "border-[#002187]/70 bg-[#002187]/[0.06] hover:bg-[#002187]/10 dark:border-[#7f95ff] dark:bg-white/[0.06]", badge: "bg-[#002187] text-white dark:bg-[#7f95ff] dark:text-[#051647]", title: "Segundo da fila" },
  3: { card: "border-[#F7915E]/70 bg-[#F7915E]/[0.06] hover:bg-[#F7915E]/10 dark:bg-[#F7915E]/[0.06]", badge: "bg-[#F7915E]/20 text-[#9a3d12] dark:text-[#F7915E]", title: "Terceiro da fila" },
};

function ListSkeleton() {
  return (
    <div role="status" aria-label="Carregando conversas" className="animate-pulse">
      {SKELETON_ROWS.map((row) => (
        <div key={row} className="mx-2 my-0.5 flex h-[72px] items-center gap-3 px-3 py-2.5">
          <div className="h-10 w-10 shrink-0 rounded-full bg-slate-200 dark:bg-slate-800" />
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
  counts: ChatCounts;
  tab: ChatTab;
  onTab: (tab: ChatTab) => void;
  search: string;
  onSearch: (value: string) => void;
  queueId: string;
  onQueue: (value: string) => void;
  priority: string;
  onPriority: (value: string) => void;
  queues: { id: string; name: string }[];
  assigneeId: string;
  onAssignee: (value: string) => void;
  attendants: Attendant[];
  /** IA em Modo Triagem Silenciosa (filtra robôs/ruídos pós-campanha, respostas automáticas desligadas). */
  silentTriage?: boolean;
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
      triggerClassName={`flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-medium text-slate-700 outline-none transition-all hover:bg-slate-50 focus:border-[#002187] dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700/50 dark:focus:border-[#C4D600] ${value ? "border-[#C4D600]" : "border-slate-200/80 dark:border-slate-700/80"}`}
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

export function ConversationList({ items, counts, tab, onTab, search, onSearch, queueId, onQueue, priority, onPriority, queues, assigneeId, onAssignee, attendants, silentTriage, loading, error, selectedId, onSelect, onDelete, onContextMenu, onEndReached, actions }: Props) {
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const list = event.currentTarget;
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 200) onEndReached();
  };
  const [showFilters, setShowFilters] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeFilters = (queueId ? 1 : 0) + (priority ? 1 : 0) + (assigneeId && tab !== "mine" ? 1 : 0);
  const moreActive = MORE_TABS.find((item) => item.id === tab);
  const clearFilters = () => {
    onQueue("");
    onPriority("");
    onAssignee("");
  };
  const tabButton = (active: boolean) => `relative flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-semibold transition-colors ${
    active ? "bg-white text-[#051647] shadow-xs dark:bg-white/10 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
  }`;
  const tabCount = (id: ChatTab) => {
    const late = id === "followups" && counts.followupsOverdue > 0;
    const urgent = id === "unread" && counts.unread > 0;
    return (
      <span
        title={late ? `${counts.followupsOverdue} ${counts.followupsOverdue === 1 ? "retorno atrasado" : "retornos atrasados"}` : undefined}
        className={`text-[10px] tabular-nums ${late ? "font-bold text-rose-600 dark:text-rose-300" : urgent ? "font-bold text-[#002187] dark:text-[#C4D600]" : "font-medium opacity-60"}`}
      >
        {counts[id]}
      </span>
    );
  };

  return (
    <>
      <div className="shrink-0 space-y-2.5 border-b border-slate-200/80 px-3 pb-2.5 pt-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Conversas</h2>
          {silentTriage && (
            <span
              title="Modo Triagem Silenciosa: a IA filtra robôs e ruídos pós-campanha, mas não responde clientes. Conversas válidas vão para a fila."
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#002187]/10 px-2 py-0.5 text-[10px] font-semibold text-[#002187] dark:bg-[#C4D600]/15 dark:text-[#C4D600]"
            >
              <ShieldCheck className="h-3 w-3" />
              Triagem
            </span>
          )}
          {counts.unread > 0 && (
            <span title="Conversas não lidas" className="rounded-full bg-slate-100 px-1.5 py-px text-[11px] font-semibold tabular-nums text-slate-600 dark:bg-white/10 dark:text-slate-300">{counts.unread}</span>
          )}
          {counts.slaBreached > 0 && (
            <button
              type="button"
              onClick={() => onTab("queue")}
              title={`${counts.slaBreached} ${counts.slaBreached === 1 ? "conversa esperando" : "conversas esperando"} há mais de ${SLA_BREACH_MINUTES} min. Clique para ver a fila.`}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-200 dark:hover:bg-rose-500/30"
            >
              <Timer className="h-3 w-3 animate-pulse" />
              {counts.slaBreached}
            </button>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Buscar conversa..."
              aria-label="Buscar conversa"
              className="h-9 w-full rounded-lg border border-slate-200/60 bg-slate-100/60 px-3 pl-9 text-sm outline-none transition-all focus:border-[#002187] focus:ring-1 focus:ring-[#002187]/30 dark:border-slate-700/60 dark:bg-slate-800/80! dark:text-white dark:focus:border-[#C4D600] dark:focus:ring-[#C4D600]/30"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((value) => !value)}
            aria-expanded={showFilters}
            aria-controls="chat-filtros"
            title="Filtros: fila, prioridade e atendente"
            className={`relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
              showFilters || activeFilters
                ? "border-[#002187]/30 bg-[#002187]/5 text-[#002187] dark:border-[#C4D600]/40 dark:bg-[#C4D600]/10 dark:text-[#C4D600]"
                : "border-slate-200/80 text-slate-600 hover:bg-slate-100 dark:border-slate-700/80 dark:text-slate-300 dark:hover:bg-white/5"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {activeFilters > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#C4D600] px-1 text-[10px] font-bold text-[#051647]">{activeFilters}</span>}
          </button>
        </div>
        {showFilters && (
          <div id="chat-filtros" className="soft-pop-in space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 dark:border-slate-700/80 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Filtros</p>
              <div className="flex items-center gap-1">
                {activeFilters > 0 && (
                  <button type="button" onClick={clearFilters} className="cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[#002187] hover:bg-white dark:text-[#C4D600] dark:hover:bg-white/10">Limpar</button>
                )}
                <button type="button" onClick={() => setShowFilters(false)} title="Fechar filtros" aria-label="Fechar filtros" className="grid h-6 w-6 cursor-pointer place-items-center rounded-md text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
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
            </div>
            <AttendantFilter value={tab === "mine" ? "" : assigneeId} onChange={onAssignee} attendants={attendants} lockedLabel={tab === "mine" ? "Meus atendimentos" : undefined} />
          </div>
        )}
        {/* Uma linha só: 3 abas principais + "Mais" com as demais (com contador e alerta de atrasos). */}
        <div role="tablist" aria-label="Situação das conversas" className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-white/[0.04]">
          {MAIN_TABS.map(({ id, label }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => onTab(id)} className={tabButton(tab === id)}>
              {label}
              {tabCount(id)}
            </button>
          ))}
          <FloatingMenu
            label="Mais situações"
            compact
            widthClassName="w-52"
            triggerClassName={tabButton(!!moreActive)}
            trigger={(
              <>
                <span className="truncate">{moreActive?.label ?? "Mais"}</span>
                {moreActive ? tabCount(moreActive.id) : counts.followupsOverdue > 0 || counts.slaBreached > 0 ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" aria-hidden /> : null}
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
              </>
            )}
            items={MORE_TABS.map(({ id, label }) => ({
              label: `${label} · ${counts[id]}${id === "followups" && counts.followupsOverdue > 0 ? ` (${counts.followupsOverdue} atrasados)` : ""}`,
              checked: tab === id,
              onSelect: () => onTab(id),
            }))}
          />
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
            // Linha 3: um único metadado. Alerta (aprovação financeira / retorno) tem preferência; senão fila · loja; senão a etiqueta.
            const alert = financialOf(item) ?? followUpOf(item);
            const tag = item.campaign ? null : originOf(item);
            const corner = cornerTime(item, waiting);
            const priorityDot = PRIORITY_DOTS[item.priority];
            const operational = [item.queue?.name, item.store ? storeLabel(item.store) : null].filter((value): value is string => !!value);
            const podium = item.queuePosition ? PODIUM[item.queuePosition] ?? null : null;
            const name = displayName(item.name);
            const unread = item.unreadCount > 0;
            const recurring = (item.totalSessions ?? 1) > 1 ? `Cliente recorrente: ${item.totalSessions} atendimentos no histórico` : "";
            return (
              <div
                key={item.id}
                className="group relative mx-1.5 my-0.5"
                onContextMenu={onContextMenu ? (event) => {
                  event.preventDefault();
                  onContextMenu(item, { x: event.clientX, y: event.clientY });
                } : undefined}
              >
                <button
                  type="button"
                  onMouseEnter={() => {
                    // Pré-carrega as mensagens no hover (~80 ms parado em cima): o clique já abre com elas.
                    if (hoverTimer.current) clearTimeout(hoverTimer.current);
                    hoverTimer.current = setTimeout(() => prefetchMessages(item.id), 80);
                  }}
                  onMouseLeave={() => {
                    if (hoverTimer.current) clearTimeout(hoverTimer.current);
                  }}
                  onPointerDown={() => prefetchMessages(item.id)}
                  onClick={() => onSelect(item.id)}
                  aria-current={selected ? "true" : undefined}
                  className={`relative flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-xl border px-2.5 py-2 text-left transition-colors duration-150 ${
                    selected
                      ? "border-transparent bg-[#07163B]/[0.06] dark:bg-white/10"
                      : podium?.card ?? (unread ? "border-transparent bg-sky-50/70 hover:bg-sky-50 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]" : "border-transparent hover:bg-slate-100/70 dark:hover:bg-white/5")
                  }`}
                >
                  {selected && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-full bg-[#07163B] dark:bg-[#C4D600]" />}
                  <div className="relative shrink-0">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold ${avatarTone(item.contactId || item.id)}`}>
                      {initials(name)}
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
                        {podium ? (
                          <span title={podium.title} className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-px text-[10px] font-bold ${podium.badge}`}>
                            {item.queuePosition === 1 && <Crown className="h-3 w-3" />}
                            {item.queuePosition}º na fila
                          </span>
                        ) : item.queuePosition ? (
                          <span title={`${item.queuePosition}º na fila`} className="shrink-0 rounded-md bg-slate-100 px-1.5 py-px text-[10px] font-semibold tabular-nums text-slate-500 dark:bg-white/10 dark:text-slate-400">#{item.queuePosition}</span>
                        ) : null}
                        <span title={[item.name, recurring].filter(Boolean).join("\n")} className={`truncate text-sm ${unread ? "font-bold text-[#051647] dark:text-white" : "font-medium text-slate-800 dark:text-slate-100"}`}>{name}</span>
                      </span>
                      <span title={corner.title} className={`shrink-0 text-xs tabular-nums ${corner.tone}`}>{corner.text}</span>
                    </div>
                    {/* Com lixeira, a linha da prévia reserva o canto dela ao passar o mouse. */}
                    <div className={`mt-0.5 flex items-center gap-1.5 ${onDelete ? "transition-[padding] group-hover:pr-7" : ""}`}>
                      {delivery && <DeliveryIcon delivery={delivery} />}
                      <p className={`min-w-0 flex-1 truncate text-xs ${unread ? "font-semibold text-slate-800 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}>
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
                    {/* Linha 3: um metadado discreto em texto suave (campanha vira só um ícone; o nome dela fica no painel do cliente). */}
                    {(alert || operational.length > 0 || tag || item.campaign) && (
                      <div className="mt-1 flex h-5 min-w-0 items-center gap-1.5 overflow-hidden text-[11px]">
                        {item.queue && (
                          <span
                            title={[`Fila: ${item.queue.name}`, item.assignee && `Atendente: ${item.assignee.name}`].filter(Boolean).join("\n")}
                            className={`inline-flex h-5 max-w-[60%] shrink-0 items-center rounded-full border px-2 text-[10px] font-semibold ${queueTone(item.queue.name)}`}
                          >
                            <span className="truncate">{item.queue.name}</span>
                          </span>
                        )}
                        {alert ? (
                          <span title={alert.title} className={`flex min-w-0 items-center gap-1 ${ORIGIN_TONES[alert.tone]}`}>
                            {alert.icon}
                            <span className="truncate">{alert.text}</span>
                          </span>
                        ) : item.store ? (
                          <span title={storeLabel(item.store)} className="min-w-0 truncate text-slate-400 dark:text-slate-500">{storeLabel(item.store)}</span>
                        ) : !item.queue && tag ? (
                          <span title={tag.title} className={`flex min-w-0 items-center gap-1 ${ORIGIN_TONES[tag.tone]}`}>
                            {tag.icon}
                            <span className="truncate">{tag.text}</span>
                          </span>
                        ) : null}
                        {item.campaign && (
                          <span title={`Respondeu à campanha: ${item.campaign.name}`} className="ml-auto shrink-0 text-violet-500 dark:text-violet-300">
                            <Megaphone className="h-3 w-3" />
                            <span className="sr-only">Campanha {item.campaign.name}</span>
                          </span>
                        )}
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
