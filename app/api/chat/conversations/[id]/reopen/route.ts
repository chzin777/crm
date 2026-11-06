import { NextResponse } from "next/server";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { reopenConversation } from "@/lib/chat/actions";
import { ChatRuleError } from "@/lib/chat/outbound";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const guard = await requireChatActor("chat.close");
  if (guard.response) return guard.response;
  if (!guard.actor.capabilities["chat.assume"]) return chatError("Sem permissão para esta ação.", 403);
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();

  try {
    await reopenConversation(guard.actor, conversation);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ChatRuleError) return chatError(error.message, error.status, { openConversationId: error.code });
    throw error;
  }
}
