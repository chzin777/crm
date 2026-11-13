import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTypingIndicator } from "@/lib/meta-whatsapp";
import { conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { isWindowOpen } from "@/lib/chat/conversation";

/**
 * Atendente digitando no /chat: mostra "digitando..." no WhatsApp do cliente usando a última mensagem recebida.
 * Leve e silencioso: sem mensagem do cliente, janela fechada ou falha da Meta, só devolve sent: false.
 */
export async function POST(request: Request) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => ({}))) as { conversationId?: unknown };
  const id = typeof body.conversationId === "string" ? body.conversationId : "";
  const conversation = id ? await findScopedConversation(guard.actor, id) : null;
  if (!conversation) return conversationNotFound();
  if (conversation.closedAt || !isWindowOpen(conversation.lastInboundAt)) return NextResponse.json({ sent: false });

  const last = await prisma.chatMessage.findFirst({
    where: { conversationId: id, author: "customer", externalId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { externalId: true },
  });
  return NextResponse.json({ sent: await sendTypingIndicator(last?.externalId) });
}
