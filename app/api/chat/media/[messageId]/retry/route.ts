import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chatError, requireChatActor, scopeWhere } from "@/lib/chat/access";
import { retryInboundMedia } from "@/lib/chat/inbound";
import { serializeMessage } from "@/lib/chat/serialize";

type Context = { params: Promise<{ messageId: string }> };

/** Baixa de novo uma mídia recebida que não chegou a ser guardada. */
export async function POST(_request: Request, context: Context) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { messageId } = await context.params;

  const message = await prisma.chatMessage.findFirst({ where: { id: messageId, conversation: scopeWhere(guard.actor) } });
  if (!message) return chatError("Mensagem não encontrada.", 404);
  if (message.attachment) return NextResponse.json(serializeMessage(message));

  const updated = await retryInboundMedia(message);
  if (!updated) return chatError("Não foi possível baixar o arquivo da Meta.", 502);
  return NextResponse.json(serializeMessage(updated));
}
