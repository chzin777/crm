import { NextResponse } from "next/server";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { resumeAi } from "@/lib/chat/actions";
import { ChatRuleError } from "@/lib/chat/outbound";

type Context = { params: Promise<{ id: string }> };

/** Devolver para a IA: tira o atendente e a IA volta a responder esta conversa. */
export async function POST(_request: Request, context: Context) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();
  try {
    await resumeAi(guard.actor, conversation);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ChatRuleError) return chatError(error.message, error.status, { code: error.code });
    throw error;
  }
}
