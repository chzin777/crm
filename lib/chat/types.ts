export type ChatTab = "queue" | "mine" | "all" | "closed" | "unread" | "campaigns";
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
