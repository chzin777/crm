import "server-only";
import type { ChatMessage } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { isWindowOpen } from "@/lib/chat/conversation";
import type { ChatAttachment } from "@/lib/chat/media-rules";

export const conversationInclude = {
  contact: { select: { name: true, email: true, segment: true, category: true, store: true } },
  queue: { select: { id: true, name: true, color: true } },
  assignee: { select: { id: true, name: true } },
  messages: {
    where: { internal: false },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
    select: { text: true, author: true, delivery: true, attachment: true, createdAt: true },
  },
} satisfies Prisma.ChatConversationInclude;

type ConversationRow = Prisma.ChatConversationGetPayload<{ include: typeof conversationInclude }>;

export function serializeConversation(row: ConversationRow) {
  const last = row.messages[0];
  const attachment = last?.attachment as ChatAttachment | null | undefined;
  return {
    id: row.id,
    contactId: row.contactId,
    name: row.contact.name,
    phone: row.phone,
    email: row.contact.email,
    segment: row.contact.segment,
    store: row.contact.store,
    category: row.contact.category,
    status: row.status,
    priority: row.priority,
    subject: row.subject,
    unreadCount: row.unreadCount,
    waitingSince: row.waitingSince,
    lastMessageAt: row.lastMessageAt,
    closedAt: row.closedAt,
    tags: row.tags,
    campaign: row.campaignId && row.campaignName ? { id: row.campaignId, name: row.campaignName } : null,
    queue: row.queue,
    assignee: row.assignee,
    windowOpen: isWindowOpen(row.lastInboundAt),
    lastMessage: last ? { text: last.text, author: last.author, delivery: last.delivery, attachmentKind: attachment?.kind ?? null } : null,
  };
}

export function serializeMessage(message: ChatMessage) {
  const attachment = message.attachment as ChatAttachment | null;
  return {
    id: message.id,
    author: message.author,
    authorName: message.authorName,
    text: message.text,
    delivery: message.delivery,
    failureReason: message.failureReason,
    internal: message.internal,
    replyTo: message.replyTo,
    createdAt: message.createdAt,
    attachment: attachment ? { kind: attachment.kind, name: attachment.name, mime: attachment.mime, size: attachment.size } : null,
  };
}
