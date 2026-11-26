import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chatError, requireChatActor, scopeWhere } from "@/lib/chat/access";
import { ChatRuleError, retryFailedMessage } from "@/lib/chat/outbound";
import { serializeMessage } from "@/lib/chat/serialize";

type Context = { params: Promise<{ messageId: string }> };

/** "Tentar novamente" na bolha com falha de envio (texto da IA ou da equipe). */
export async function POST(_request: Request, context: Context) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { messageId } = await context.params;

  const message = await prisma.chatMessage.findFirst({ where: { id: messageId, conversation: scopeWhere(guard.actor) }, include: { conversation: true } });
  if (!message) return chatError("Mensagem não encontrada.", 404);
  try {
    const { conversation, ...row } = message;
    return NextResponse.json(serializeMessage(await retryFailedMessage(row, conversation)));
  } catch (error) {
    if (error instanceof ChatRuleError) return chatError(error.message, error.status, { code: error.code });
    console.error("[chat] tentar novamente:", error);
    return chatError("Não foi possível reenviar a mensagem.", 500);
  }
}
