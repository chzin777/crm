import { NextResponse } from "next/server";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { assumeFor, ChatRuleError } from "@/lib/chat/outbound";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();
  if (conversation.closedAt) return chatError("Conversa encerrada. Reabra para assumir.", 409);

  try {
    await assumeFor(guard.actor, conversation);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ChatRuleError) return chatError(error.message, error.status, { code: error.code });
    throw error;
  }
}
