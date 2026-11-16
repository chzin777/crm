import { NextResponse } from "next/server";
import { conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { pendingApproval, serializeApproval } from "@/lib/ai/installments-db";

type Context = { params: Promise<{ id: string }> };

/** Aprovação financeira pendente da conversa (card acima da caixa de digitação no /chat). */
export async function GET(_request: Request, context: Context) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();
  const action = await pendingApproval(conversation.id);
  return NextResponse.json({ approval: action ? serializeApproval(action) : null });
}
