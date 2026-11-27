import "server-only";
import type { ChatConversation } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AI_AUTHOR_NAME } from "@/lib/ai/sanitize";

type Attribution = { responderType: "ai" | "human" | null; attendantId: string | null };

/** A reabertura inicia outro atendimento; devolver à IA não apaga a participação humana do ciclo. */
export async function npsAttribution(conversation: Pick<ChatConversation, "id" | "assigneeId">, fallbackId: string | null): Promise<Attribution> {
  const reopen = await prisma.chatAudit.findFirst({
    where: { targetId: conversation.id, action: "conversation.reopen" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const since = reopen ? { gte: reopen.createdAt } : undefined;
  const [human, ai, menuAssignment, audits] = await Promise.all([
    prisma.chatMessage.findFirst({
      where: { conversationId: conversation.id, author: "agent", internal: false, ...(since ? { createdAt: since } : {}) },
      orderBy: { createdAt: "desc" },
      select: { authorUserId: true },
    }),
    prisma.chatMessage.findFirst({
      where: { conversationId: conversation.id, author: "bot", authorName: AI_AUTHOR_NAME, internal: false, delivery: { in: ["sent", "delivered", "read"] }, ...(since ? { createdAt: since } : {}) },
      select: { id: true },
    }),
    prisma.chatMessage.findFirst({
      where: { conversationId: conversation.id, author: "system", OR: [{ text: { startsWith: "Menu automático atribuiu a " } }, { text: { startsWith: "Rodízio da fila " } }, { text: { startsWith: "IA atribuiu a " } }], ...(since ? { createdAt: since } : {}) },
      select: { id: true },
    }),
    prisma.chatAudit.findMany({
      where: { targetId: conversation.id, action: { in: ["conversation.assume", "conversation.reopen", "conversation.transfer", "conversation.ai_resume"] }, ...(since ? { createdAt: since } : {}) },
      orderBy: { createdAt: "desc" },
      select: { action: true, userId: true, before: true, after: true },
    }),
  ]);
  const assigned = audits.map((audit) => {
    if (audit.action === "conversation.reopen" || audit.action === "conversation.assume") return audit.userId;
    for (const value of [audit.after, audit.before]) {
      if (value && typeof value === "object" && !Array.isArray(value) && typeof value.assigneeId === "string") return value.assigneeId;
    }
    return null;
  }).find((id) => id !== null);
  if (conversation.assigneeId || human || assigned || menuAssignment) {
    return { responderType: "human", attendantId: conversation.assigneeId ?? human?.authorUserId ?? assigned ?? null };
  }
  if (ai) return { responderType: "ai", attendantId: null };
  return { responderType: fallbackId ? "human" : null, attendantId: fallbackId };
}
