export type ChatTab = "queue" | "mine" | "all" | "closed" | "unread" | "campaigns" | "followups";

/** Contadores das abas, mais os lembretes vencidos do atendente e as conversas com espera acima do limite. */
export type ChatCounts = Record<ChatTab, number> & { followupsOverdue: number; slaBreached: number };

/** Espera em "Aguardando": até 10 min normal, até 20 min alerta, acima disso fora do prazo. */
export const SLA_WARN_MINUTES = 10;
export const SLA_BREACH_MINUTES = 20;

export type FollowUpItem = {
  id: string;
  dueAt: string;
  note: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  completedAt: string | null;
  userName: string;
  mine: boolean;
};

export type ScheduledMessageItem = {
  id: string;
  text: string;
  scheduledFor: string;
  status: "SCHEDULED" | "SENT" | "FAILED" | "CANCELLED";
  failureReason: string | null;
  userName: string;
};

/** Visão do cliente no ERP para o painel lateral do chat. */
export type CustomerHistory = {
  cpf: string | null;
  store: string | null;
  purchases: number;
  totalSpent: number;
  lastPurchaseDate: string | null;
  /** O espelho do ERP não traz a receita: a última compra de lentes de grau serve de referência para a renovação. */
  prescription: { lastLensPurchase: string | null; lensType: string | null; expiry: string | null; renewalDue: boolean };
  orders: { orderNumber: string; date: string | null; total: number; store: string; status: string; invoice: string | null; items: number; summary: string }[];
  campaigns: { name: string; sentAt: string | null; status: string; repliedAt: string | null }[];
};
export type ChatStatus = "bot" | "waiting" | "in_progress" | "closed";
export type ChatPriority = "low" | "normal" | "high" | "urgent";
export type ChatAuthor = "customer" | "agent" | "bot" | "system";
export type ChatDelivery = "sending" | "sent" | "delivered" | "read" | "failed";

export type ConversationItem = {
  id: string;
  contactId: string;
  name: string;
  phone: string;
  email: string | null;
  segment: string | null;
  store: string | null;
  category: string;
  status: ChatStatus;
  priority: ChatPriority;
  subject: string;
  unreadCount: number;
  waitingSince: string | null;
  lastMessageAt: string | null;
  closedAt: string | null;
  tags: string[];
  campaign: { id: string; name: string } | null;
  queue: { id: string; name: string; color: string } | null;
  assignee: { id: string; name: string } | null;
  windowOpen: boolean;
  lastMessage: { text: string; author: ChatAuthor; delivery: ChatDelivery | null; attachmentKind: string | null } | null;
  /** Próximo lembrete de retorno pendente da conversa (de qualquer atendente). */
  followUp: { dueAt: string; note: string } | null;
};

export type ConversationDetail = ConversationItem & {
  blocked: boolean;
  campaigns: { id: string; name: string; repliedAt: string }[];
  previous: { id: string; status: ChatStatus; subject: string; createdAt: string; closedAt: string | null; queue: { name: string } | null }[];
};

export type ContactNoteItem = { id: string; text: string; authorName: string; createdAt: string };

/** Dados da ficha, buscados só ao abrir o modal para não pesar no pulso da conversa. */
export type ContactProfile = {
  cpf: string | null;
  avatarUrl: string | null;
  createdAt: string;
  origin: string;
  messageCount: number;
  conversationCount: number;
  firstMessageToday: string | null;
  notes: ContactNoteItem[];
};

export type ChatMessageItem = {
  id: string;
  author: ChatAuthor;
  authorName: string | null;
  text: string;
  delivery: ChatDelivery | null;
  failureReason: string | null;
  internal: boolean;
  replyTo: { author: string; text: string; messageId?: string } | null;
  createdAt: string;
  attachment: { kind: string; name: string; mime: string; size: number; localUrl?: string } | null;
  pendingMedia?: string | null;
  /** Presente quando a mensagem saiu como lista interativa; o texto fica só como alternativa. */
  interactive?: ChatInteractiveList | null;
};

export const PRIORITY_LABELS: Record<ChatPriority, string> = { low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" };
export const STATUS_LABELS: Record<ChatStatus, string> = { bot: "No menu", waiting: "Na fila", in_progress: "Em atendimento", closed: "Encerrada" };

/** Lista interativa da Meta enviada pelo robô (menu, pesquisa NPS), guardada para o atendimento ver como o cliente recebeu. */
export type ChatInteractiveList = {
  type: "list";
  header?: string;
  body: string;
  footer?: string;
  button: string;
  sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
};
