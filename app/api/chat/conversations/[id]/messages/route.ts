import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { serializeMessage } from "@/lib/chat/serialize";

type Context = { params: Promise<{ id: string }> };

const PAGE_SIZE = 50;

export async function GET(request: Request, context: Context) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const after = url.searchParams.get("after");

  const rows = await prisma.chatMessage.findMany({
    where: { conversationId: id, ...(after ? { createdAt: { gte: new Date(after) } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const page = rows.slice(0, PAGE_SIZE);
  return NextResponse.json({
    items: page.reverse().map(serializeMessage),
    nextCursor: rows.length > PAGE_SIZE ? page[0].id : null,
  });
}
