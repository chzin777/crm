import { NextResponse } from "next/server";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { closeConversation } from "@/lib/chat/actions";
import { addSystemMessage, isWindowOpen } from "@/lib/chat/conversation";
import { sendSatisfactionSurvey } from "@/lib/chat/nps";
import { ChatRuleError } from "@/lib/chat/outbound";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const guard = await requireChatActor("chat.close");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();

  try {
    await closeConversation(conversation, guard.actor, `${guard.actor.name} encerrou a conversa`);
    if (isWindowOpen(conversation.lastInboundAt)) await sendSatisfactionSurvey(conversation, conversation.assigneeId ?? guard.actor.id);
    // Sem isso parece que o sistema esqueceu: a Meta só aceita mensagem livre até 24h depois da última do cliente.
    else await addSystemMessage(conversation.id, "Despedida e pesquisa de satisfação não enviadas: o cliente não escreve há mais de 24h.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ChatRuleError) return chatError(error.message, error.status);
    throw error;
  }
}
