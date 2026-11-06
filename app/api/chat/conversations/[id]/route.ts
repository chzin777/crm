import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireChatActor, scopeWhere, conversationNotFound } from "@/lib/chat/access";
import { isBlocked } from "@/lib/chat/conversation";
import { conversationInclude, serializeConversation } from "@/lib/chat/serialize";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { id } = await context.params;

  const row = await prisma.chatConversation.findFirst({
    where: { AND: [{ id }, scopeWhere(guard.actor)] },
    include: conversationInclude,
  });
  if (!row) return conversationNotFound();

  const [blocked, previous] = await Promise.all([
    isBlocked(row.phone),
    prisma.chatConversation.findMany({
      where: { AND: [{ contactId: row.contactId, id: { not: row.id } }, scopeWhere(guard.actor)] },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, status: true, subject: true, createdAt: true, closedAt: true, queue: { select: { name: true } } },
    }),
  ]);

  return NextResponse.json({ ...serializeConversation(row), blocked, previous });
}
