import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { markMessageRead } from "@/lib/meta-whatsapp";
import { conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();

  const body = (await request.json().catch(() => ({}))) as { unread?: boolean };
  if (body.unread) {
    await prisma.chatConversation.update({ where: { id }, data: { unreadCount: 1 } });
    return NextResponse.json({ ok: true });
  }

  const hadUnread = conversation.unreadCount > 0;
  await prisma.chatConversation.update({ where: { id }, data: { unreadCount: 0, updatedAt: new Date() } });

  if (hadUnread) {
    const last = await prisma.chatMessage.findFirst({
      where: { conversationId: id, author: "customer", externalId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { externalId: true },
    });
    if (last?.externalId) await markMessageRead(last.externalId).catch((error) => console.error("[chat] confirmação de leitura:", error));
  }
  return NextResponse.json({ ok: true });
}
